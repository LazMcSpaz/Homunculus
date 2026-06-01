import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Claude Haiku 4.5 — fast, cheap structured output. Per the AI Layer design doc.
const MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/** Resolve the API key from the Cloudflare Worker env, falling back to process.env (local dev). */
async function getApiKey(): Promise<string | undefined> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = getCloudflareContext();
    if (env?.ANTHROPIC_API_KEY) return env.ANTHROPIC_API_KEY;
  } catch {
    // Not running on the Cloudflare runtime (e.g. plain `next dev`).
  }
  return process.env.ANTHROPIC_API_KEY;
}

interface TaskCtx {
  id: string;
  summary: string;
  importance: string;
  domain: string | null;
  size: string | null;
  type: string | null;
  fog_level: string;
  deadline: string | null;
  deadline_confidence: string | null;
  blocked_by: string[];
}

interface PrioritisePayload {
  mode: 'open' | 'crunch';
  name?: string;
  notification_tone?: string;
  domains: { id: string; name: string; weight: number }[];
  tasks: TaskCtx[];
  current_datetime: string;
}

const PERSONA = `You are Homunculus — a personal achievement engine and the user's trusted lieutenant. You have opinions and express them plainly, but you never forget the user is in charge: your job is to inform their decision about what to do next, not to nag or pad with hedging.

You will receive the user's active tasks with their importance, domain, deadline, fog level, and dependencies, plus the user's current operating mode and domain weights. Decide what deserves attention right now.

Rules:
- Be direct and specific. Reference real task content. No filler, no preamble.
- Respect deadlines and dependencies. A task blocked by unfinished work is rarely the right "next".
- "foggy" tasks may need breaking down rather than doing — flag them for the advisor instead of recommending raw action on them.
- Match tone to notification_tone: "minimal"/"quiet" = terse; "assertive"/"send_them" = more forthright; otherwise balanced.

Respond with ONLY a single JSON object, no markdown fences, no prose outside it.

In OPEN mode return:
{
  "mode": "open",
  "recommendation": { "task_id": "<uuid>", "rationale": "1-3 plain sentences on why this, now", "energy_note": "<optional one sentence; omit if not clearly relevant>" },
  "also_consider": [ { "task_id": "<uuid>", "reason": "one sentence" } ],   // 0-2 genuine alternatives
  "flag_for_advisor": [ "<uuid>" ]   // foggy tasks an advisor session would unblock; may be empty
}

In CRUNCH mode return:
{
  "mode": "crunch",
  "attention_queue": [ { "task_id": "<uuid>", "what_is_needed": "clarify_details|confirm_priority|set_deadline|break_down|review_assumptions", "note": "one sentence on why this needs attention now" } ],  // up to 5, ordered
  "flag_for_advisor": [ "<uuid>" ]
}

Every task_id you return MUST be one of the provided task ids.`;

function buildUserContent(p: PrioritisePayload): string {
  const domainName = (id: string | null) =>
    (id && p.domains.find((d) => d.id === id)?.name) || 'Uncategorized';
  const lines = p.tasks.map((t) => {
    const parts = [
      `id=${t.id}`,
      `importance=${t.importance}`,
      `domain=${domainName(t.domain)}`,
    ];
    if (t.size) parts.push(`size=${t.size}`);
    if (t.type) parts.push(`type=${t.type}`);
    if (t.fog_level && t.fog_level !== 'clear') parts.push(`fog=${t.fog_level}`);
    if (t.deadline) parts.push(`deadline=${t.deadline} (${t.deadline_confidence ?? 'unknown'})`);
    if (t.blocked_by.length) parts.push(`blocked_by=${t.blocked_by.length} task(s)`);
    return `- "${t.summary}" [${parts.join(', ')}]`;
  });
  const weights = p.domains.map((d) => `${d.name} (weight ${d.weight})`).join(', ');
  return [
    `Current date/time: ${p.current_datetime}`,
    `Operating mode: ${p.mode}`,
    p.name ? `User: ${p.name}` : null,
    `Domain weights: ${weights || 'none set'}`,
    '',
    'Active tasks:',
    ...lines,
    '',
    p.mode === 'crunch'
      ? 'What tasks need my attention most right now?'
      : 'What should I focus on next?',
  ]
    .filter(Boolean)
    .join('\n');
}

function extractJson(text: string): unknown {
  // Prefer a fenced or bare JSON object; fall back to the first balanced {...}.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in model response');
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function POST(request: Request) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    // Signal the client to use its native fallback ranking.
    return NextResponse.json(
      { error: 'AI not configured', code: 'no_api_key' },
      { status: 503 },
    );
  }

  let payload: PrioritisePayload;
  try {
    payload = (await request.json()) as PrioritisePayload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!payload?.tasks?.length) {
    return NextResponse.json({ error: 'No tasks to prioritise' }, { status: 400 });
  }

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        // Cache the standing persona/instructions — static across every call.
        system: [{ type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildUserContent(payload) }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: 'Upstream AI error', status: res.status, detail: detail.slice(0, 500) },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');

    const parsed = extractJson(text);
    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to get recommendation', detail: String(err) },
      { status: 502 },
    );
  }
}
