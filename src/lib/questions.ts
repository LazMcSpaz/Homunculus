import { db } from './db';
import { logEvent } from './actions';
import type { ImportanceLevel } from './types';

export interface QueuedQuestion {
  taskId: string;
  taskTitle: string;
  question: string;
  asked_at: string;
}

// Question-queue rules (homunculus_changes.docx — Decisions Pending a Home):
// - Surface on app open (and notifications, when built) only.
// - Max 2 per session. Oldest question first.
// - App-open gate: surface only if the task is high/critical importance OR the
//   question has aged past 7 days. Otherwise it waits for a later surface.
const MAX_PER_SESSION = 2;
const AGE_GATE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_KEY = 'homunculus.questionsSurfaced';

const HIGH = new Set<ImportanceLevel>(['high', 'critical']);

function surfacedThisSession(): number {
  if (typeof sessionStorage === 'undefined') return 0;
  return Number(sessionStorage.getItem(SESSION_KEY) ?? '0');
}

function noteSurfaced(n: number) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(SESSION_KEY, String(surfacedThisSession() + n));
}

/**
 * Returns the clarifying questions to surface at this app open, honoring the
 * per-session cap, the importance/age gate, and oldest-first ordering.
 */
export async function getQueuedQuestions(): Promise<QueuedQuestion[]> {
  const remaining = MAX_PER_SESSION - surfacedThisSession();
  if (remaining <= 0) return [];

  const now = Date.now();
  const tasks = await db.tasks.where('status').anyOf('active', 'in_progress').toArray();

  const candidates: QueuedQuestion[] = [];
  for (const task of tasks) {
    const gateByImportance = HIGH.has(task.importance);
    for (const q of task.clarification_history) {
      if (q.answer !== null || q.dismissed_at) continue;
      const aged = now - new Date(q.asked_at).getTime() > AGE_GATE_MS;
      if (!gateByImportance && !aged) continue;
      candidates.push({
        taskId: task.id,
        taskTitle: task.title,
        question: q.question,
        asked_at: q.asked_at,
      });
    }
  }

  candidates.sort((a, b) => new Date(a.asked_at).getTime() - new Date(b.asked_at).getTime());
  return candidates.slice(0, remaining);
}

export async function answerQuestion(taskId: string, question: string, answer: string): Promise<void> {
  const task = await db.tasks.get(taskId);
  if (!task) return;
  const now = new Date().toISOString();
  const history = task.clarification_history.map((q) =>
    q.question === question && q.answer === null && !q.dismissed_at
      ? { ...q, answer, answered_at: now }
      : q,
  );
  await db.tasks.update(taskId, { clarification_history: history });
  await logEvent('question_answered', { task_id: taskId, question });
  noteSurfaced(1);
}

export async function dismissQuestion(taskId: string, question: string): Promise<void> {
  const task = await db.tasks.get(taskId);
  if (!task) return;
  const now = new Date().toISOString();
  const history = task.clarification_history.map((q) =>
    q.question === question && q.answer === null && !q.dismissed_at
      ? { ...q, dismissed_at: now }
      : q,
  );
  await db.tasks.update(taskId, { clarification_history: history });
  await logEvent('question_dismissed', { task_id: taskId, question });
  noteSurfaced(1);
}
