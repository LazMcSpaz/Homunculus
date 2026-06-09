import { NextResponse } from 'next/server';
import { getApiKey, callAnthropic, extractJson } from '../_anthropic';

export const dynamic = 'force-dynamic';

interface ReviewMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ReviewDomain {
  id: string;
  name: string;
  weight: number;
}

interface CompletedTaskSummary {
  summary: string;
  domain: string | null;
  type: string | null;
  importance: string;
}

interface ActiveTaskSummary {
  task_id: string;
  summary: string;
  domain: string | null;
  importance: string;
  deadline: string | null;
  enrichment_status: string;
  unanswered_questions: number;
}

interface WeekSummary {
  completed: CompletedTaskSummary[];
  active: ActiveTaskSummary[];
  date_range: { start: string; end: string };
}

interface ReviewPayload {
  name?: string;
  mode: 'open' | 'crunch';
  domains: ReviewDomain[];
  week_summary: WeekSummary;
  messages: ReviewMessage[];
}

const PERSONA = `You are Homunculus running the user's weekly review. This is a short conversation, not a report. Be direct, warm, and non-judgmental, and surface one thing at a time.

You move through up to three beats, and you control the pacing:
1. Accomplishments — open here. Reflect back what got done this week, framed positively and synthesised (not a list). Read-only; never propose changes in this beat.
2. Attention gaps — surface tasks that needed more input than they got: high-importance under-clarified tasks, aged unanswered questions, unmade deadline/priority decisions. One at a time. SKIP this beat entirely if nothing genuinely needs input — do not manufacture gaps.
3. Assumption checks — surface up to 3 assumptions (priorities, domain weights, inferred deadlines) as observations, and ask whether they still feel right. One at a time.

Lead with what got done. In crunch mode keep the whole review briefer. When the conversation has run its course, write a short closing message and set session_state to "complete".

When the user confirms a change (a corrected deadline, priority, mode, etc.), record it in task_updates or profile_updates so the native layer can persist it.

Allowed task_updates fields: importance_manual, deadline, deadline_confidence, next_action, fog_level, size, type, status, domain_id.
Allowed profile_updates field: operating_mode (value "open" or "crunch") only.

Respond with ONLY a single JSON object, no markdown fences, no prose outside it:
{
  "response_text": "your conversational message for this turn — one thing at a time",
  "beat": "accomplishments | attention_gaps | assumption_checks | closing",
  "session_state": "in_progress | complete",
  "task_updates": [ { "task_id": "...", "field": "...", "new_value": ... } ],
  "profile_updates": [ { "field": "operating_mode", "new_value": "open | crunch" } ]
}
Omit task_updates / profile_updates when there is nothing to write.`;

function buildContext(p: ReviewPayload): string {
  const w = p.week_summary;
  const domains = p.domains.length
    ? p.domains.map((d) => `${d.name} (weight ${d.weight})`).join(', ')
    : 'none defined';

  const completed = w.completed.length
    ? w.completed
        .map(
          (t) =>
            `- ${t.summary} [domain: ${t.domain ?? 'none'}, type: ${t.type ?? 'none'}, importance: ${t.importance}]`,
        )
        .join('\n')
    : '(nothing completed this week)';

  const active = w.active.length
    ? w.active
        .map(
          (t) =>
            `- (${t.task_id}) ${t.summary} [domain: ${t.domain ?? 'none'}, importance: ${t.importance}, deadline: ${t.deadline ?? 'none'}, enrichment: ${t.enrichment_status}, unanswered questions: ${t.unanswered_questions}]`,
        )
        .join('\n')
    : '(no outstanding active tasks)';

  return [
    p.name ? `User: ${p.name}` : null,
    `Operating mode: ${p.mode}`,
    `Active domains: ${domains}`,
    `Date range: ${w.date_range.start} to ${w.date_range.end} (last 7 days)`,
    '',
    'Completed this week:',
    completed,
    '',
    'Active tasks not completed (use the task_id in parentheses for any task_updates):',
    active,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function POST(request: Request) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured', code: 'no_api_key' }, { status: 503 });
  }

  let payload: ReviewPayload;
  try {
    payload = (await request.json()) as ReviewPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!payload?.week_summary || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    return NextResponse.json({ error: 'Missing week summary or messages' }, { status: 400 });
  }

  // Conversation history is passed verbatim each turn (no summarisation between turns).
  const messages = payload.messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));

  try {
    const result = await callAnthropic(apiKey, {
      system: [
        { type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: buildContext(payload) },
      ],
      messages,
      // Headroom for turns that return task_updates / profile_updates alongside prose.
      maxTokens: 1536,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: 'Upstream AI error', status: result.status, detail: result.text },
        { status: 502 },
      );
    }

    return NextResponse.json(extractJson(result.text));
  } catch (err) {
    return NextResponse.json({ error: 'Failed to run review', detail: String(err) }, { status: 502 });
  }
}
