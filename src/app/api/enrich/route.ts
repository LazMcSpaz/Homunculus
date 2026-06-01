import { NextResponse } from 'next/server';
import { getApiKey, callAnthropic, extractJson } from '../_anthropic';

export const dynamic = 'force-dynamic';

interface RawTask {
  id: string;
  raw_capture: string;
  capture_mode: string;
  domain: string | null; // confirmed by the user at capture; context only, never reassigned
  captured_at: string;
}

interface EnrichPayload {
  tasks: RawTask[];
  domains: { id: string; name: string; weight: number }[];
  known_context?: string[];
  default_task_type?: string;
  current_datetime: string;
}

// Note: domain is NOT an enrichment output — the user assigns it at capture
// (see homunculus_changes.docx §02). Claude receives it as confirmed context only.
const PERSONA = `You are the background enrichment layer of Homunculus, a personal achievement engine. You transform a user's raw task captures into structured records. This runs silently in the background — the user never sees you directly. Your output becomes the canonical understanding of each task used by every later decision.

You receive a batch of raw captures plus the user's domains, confirmed known context, and default task type. For EACH task, produce a structured enrichment.

Rules:
- enrichment_summary is the heart of it: 2-4 plain-English sentences capturing what the task actually is, as a knowledgeable assistant would restate it. Resolve vague references using known_context. Never invent specifics the capture doesn't support.
- Do NOT assign or change the domain — the user has already set it. It is given only as context.
- Infer a deadline ONLY if the capture clearly implies one (e.g. "by Friday", "before the 15th"); compute it relative to captured_at and set deadline_confidence accordingly. Omit if none.
- size: moment (single action <~30min) | project (multi-step) | someday (real but not yet actionable).
- type: obligation | investment | enjoyment. Use default_task_type as a prior when unclear.
- fog_level: clear (user knows the steps) | hazy | foggy (user likely can't picture how to proceed).
- next_action: the single concrete next step, only if clearly implied. Omit otherwise.
- suggested_subtasks: only if size is project AND steps are clearly implied — a short ordered list of labels. The user confirms before any are created. Omit otherwise.
- questions: up to two clarifying questions you'd want answered about this task, highest priority first. Omit if none genuinely needed.

Respond with ONLY a JSON array, no markdown fences, no prose. One object per input task, each shaped:
{
  "id": "<echo the input task id>",
  "enrichment_summary": "...",
  "size": "moment|project|someday",
  "type": "obligation|investment|enjoyment",
  "importance": "low|medium|high|critical",
  "fog_level": "clear|hazy|foggy",
  "deadline": "<ISO8601, optional>",
  "deadline_confidence": "hard|soft|estimated (required iff deadline present)",
  "next_action": "<optional>",
  "suggested_subtasks": ["...", "..."],
  "questions": ["...", "..."]
}
Every id MUST match an input id exactly.`;

function buildUserContent(p: EnrichPayload): string {
  const domainName = (id: string | null) =>
    (id && p.domains.find((d) => d.id === id)?.name) || 'Uncategorized';
  const tasks = p.tasks.map((t) => ({
    id: t.id,
    raw_capture: t.raw_capture,
    capture_mode: t.capture_mode,
    domain: domainName(t.domain),
    captured_at: t.captured_at,
  }));
  return [
    `Current date/time: ${p.current_datetime}`,
    p.default_task_type ? `User's default task type: ${p.default_task_type}` : null,
    p.known_context && p.known_context.length
      ? `Known context: ${p.known_context.join('; ')}`
      : null,
    `Domains: ${p.domains.map((d) => d.name).join(', ') || 'none'}`,
    '',
    'Enrich these tasks:',
    JSON.stringify(tasks, null, 2),
  ]
    .filter(Boolean)
    .join('\n');
}

export async function POST(request: Request) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured', code: 'no_api_key' }, { status: 503 });
  }

  let payload: EnrichPayload;
  try {
    payload = (await request.json()) as EnrichPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!payload?.tasks?.length) {
    return NextResponse.json({ error: 'No tasks to enrich' }, { status: 400 });
  }

  try {
    const result = await callAnthropic(apiKey, {
      // Persona + standing instructions are static — cache them across batches.
      system: [{ type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } }],
      userContent: buildUserContent(payload),
      maxTokens: 2048,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: 'Upstream AI error', status: result.status, detail: result.text },
        { status: 502 },
      );
    }

    const parsed = extractJson(result.text);
    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Malformed enrichment response' }, { status: 502 });
    }
    return NextResponse.json({ results: parsed });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to enrich', detail: String(err) },
      { status: 502 },
    );
  }
}
