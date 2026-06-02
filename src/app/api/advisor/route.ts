import { NextResponse } from 'next/server';
import { getApiKey, callAnthropic, extractJson } from '../_anthropic';

export const dynamic = 'force-dynamic';

interface AdvisorTask {
  summary: string;
  domain: string | null;
  importance: string;
  deadline: string | null;
  fog_level: string;
  questions_asked: { question: string; answer: string | null }[];
  subtasks: string[];
}

interface AdvisorMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AdvisorPayload {
  task: AdvisorTask;
  name?: string;
  mode: 'open' | 'crunch';
  known_context?: string[];
  messages: AdvisorMessage[];
}

const PERSONA = `You are Homunculus acting as an advisor. The user is stuck on a task and can't picture how to proceed; your job is to help them think it through — not to think for them, and not to do it for them.

How you work:
- Ask ONE question at a time. Short, concrete, and aimed at unsticking the next step.
- Do not lecture or list options unless you are decomposing an agreed task into steps.
- Build on what the user says. Never re-ask anything in questions_asked.
- The goal is a clear path forward, not a finished task. End the session ("resolved") the moment the user knows exactly what to do next — even if the task itself is large.
- In crunch mode keep it tight and focused; in open mode you may explore a little more.

Respond with ONLY a single JSON object, no markdown fences, no prose outside it:
{
  "response_text": "your conversational reply to the user — one question at a time when asking; no bullet lists unless decomposing into steps",
  "session_state": "in_progress | resolved | needs_more_info",
  "next_action": "<optional: the single concrete next step, once it's clear>",
  "suggested_subtasks": ["<optional ordered step labels, only once decomposition has been agreed>"],
  "new_questions": ["<optional: new clarifying questions that surfaced, to queue for later>"]
}`;

function buildTaskContext(p: AdvisorPayload): string {
  const t = p.task;
  const asked = t.questions_asked
    .filter((q) => q.answer)
    .map((q) => `Q: ${q.question}\nA: ${q.answer}`)
    .join('\n');
  return [
    p.name ? `User: ${p.name}` : null,
    `Operating mode: ${p.mode}`,
    p.known_context && p.known_context.length ? `Known context: ${p.known_context.join('; ')}` : null,
    '',
    'The task they are stuck on:',
    `Summary: ${t.summary}`,
    t.domain ? `Domain: ${t.domain}` : null,
    `Importance: ${t.importance}`,
    `Fog level: ${t.fog_level}`,
    t.deadline ? `Deadline: ${t.deadline}` : null,
    t.subtasks.length ? `Existing subtasks: ${t.subtasks.join('; ')}` : null,
    asked ? `Already asked & answered (do not re-ask):\n${asked}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function POST(request: Request) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured', code: 'no_api_key' }, { status: 503 });
  }

  let payload: AdvisorPayload;
  try {
    payload = (await request.json()) as AdvisorPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!payload?.task?.summary || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    return NextResponse.json({ error: 'Missing task or messages' }, { status: 400 });
  }

  // Conversation history is passed verbatim each turn (no summarisation between turns).
  const messages = payload.messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));

  try {
    const result = await callAnthropic(apiKey, {
      system: [
        { type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: buildTaskContext(payload) },
      ],
      messages,
      maxTokens: 768,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: 'Upstream AI error', status: result.status, detail: result.text },
        { status: 502 },
      );
    }

    return NextResponse.json(extractJson(result.text));
  } catch (err) {
    return NextResponse.json({ error: 'Failed to advise', detail: String(err) }, { status: 502 });
  }
}
