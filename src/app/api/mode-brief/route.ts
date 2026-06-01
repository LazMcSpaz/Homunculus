import { NextResponse } from 'next/server';
import { getApiKey, callAnthropic, extractJson } from '../_anthropic';

export const dynamic = 'force-dynamic';

interface BriefTask {
  id: string;
  summary: string;
  importance: string;
  domain: string | null;
  deadline: string | null;
}

interface ModeBriefPayload {
  name?: string;
  from_mode: string;
  to_mode: string;
  domains: { id: string; name: string; weight: number }[];
  accumulated: BriefTask[]; // captured during previous mode, not yet processed
  high_priority: BriefTask[]; // active, high/critical
  current_datetime: string;
}

// Mode transition brief (AI Layer design doc §06). Forward-facing orientation
// for the mode being entered — not a review of the mode being left.
const PERSONA = `You are Homunculus, the user's trusted lieutenant. The user has just switched operating mode. Write a short, forward-facing brief that orients them to the mode they are entering — what has accumulated, what now matters most, and where to put their attention first. This is not a review of the previous mode.

Voice: a trusted advisor speaking plainly. The crunch→open transition is re-entering a wide context after narrow focus — make it feel like surfacing for air, grounding not overwhelming. The open→crunch transition should sharpen focus onto what's urgent.

Respond with ONLY a JSON object, no fences, no prose outside it:
{
  "brief_text": "2-4 short paragraphs, no bullet points, written as a trusted advisor would speak. Acknowledge the transition, note what accumulated, identify the most important area to engage first, and close with a specific suggested first action.",
  "priority_task_id": "<uuid of the single task to engage first; must be one of the provided ids, or null if none>",
  "attention_items": [ { "task_id": "<uuid>", "reason": "one sentence" } ]
}
attention_items: up to 3, each a provided id. Every id MUST be one provided.`;

function buildUserContent(p: ModeBriefPayload): string {
  const domainName = (id: string | null) =>
    (id && p.domains.find((d) => d.id === id)?.name) || 'Uncategorized';
  const fmt = (t: BriefTask) =>
    `- "${t.summary}" [id=${t.id}, importance=${t.importance}, domain=${domainName(t.domain)}${t.deadline ? `, deadline=${t.deadline}` : ''}]`;
  return [
    p.name ? `User: ${p.name}` : null,
    `Current date/time: ${p.current_datetime}`,
    `Transition: ${p.from_mode} → ${p.to_mode}`,
    `Domain weights: ${p.domains.map((d) => `${d.name} (${d.weight})`).join(', ') || 'none'}`,
    '',
    `High-priority active tasks (${p.high_priority.length}):`,
    ...(p.high_priority.length ? p.high_priority.map(fmt) : ['- none']),
    '',
    `Captured but not yet processed (${p.accumulated.length}):`,
    ...(p.accumulated.length ? p.accumulated.map(fmt) : ['- none']),
    '',
    `Brief me on entering ${p.to_mode} mode.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function POST(request: Request) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured', code: 'no_api_key' }, { status: 503 });
  }

  let payload: ModeBriefPayload;
  try {
    payload = (await request.json()) as ModeBriefPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const result = await callAnthropic(apiKey, {
      system: [{ type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } }],
      userContent: buildUserContent(payload),
      maxTokens: 1024,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: 'Upstream AI error', status: result.status, detail: result.text },
        { status: 502 },
      );
    }
    return NextResponse.json(extractJson(result.text));
  } catch (err) {
    return NextResponse.json({ error: 'Failed to brief', detail: String(err) }, { status: 502 });
  }
}
