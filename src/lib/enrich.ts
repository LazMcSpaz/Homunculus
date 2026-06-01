import { db } from './db';
import { getProfile, recalculateAllImportance } from './actions';
import { invalidatePrioritisationCache } from './ai';
import type {
  Task,
  TaskSize,
  TaskType,
  FogLevel,
  DeadlineConfidence,
  ClarificationEntry,
} from './types';

interface EnrichmentResult {
  id: string;
  enrichment_summary?: string;
  size?: TaskSize;
  type?: TaskType;
  importance?: string;
  fog_level?: FogLevel;
  deadline?: string;
  deadline_confidence?: DeadlineConfidence;
  next_action?: string;
  suggested_subtasks?: string[];
  questions?: string[];
}

// Guard so overlapping triggers (app open + capture) don't double-submit.
let running = false;

const VALID_SIZE: TaskSize[] = ['moment', 'project', 'someday'];
const VALID_TYPE: TaskType[] = ['obligation', 'investment', 'enjoyment'];
const VALID_FOG: FogLevel[] = ['clear', 'hazy', 'foggy'];
const VALID_CONF: DeadlineConfidence[] = ['hard', 'soft', 'estimated'];

/** Tasks awaiting enrichment: raw captures that haven't been processed yet. */
function pendingTasks(tasks: Task[]): Task[] {
  return tasks.filter(
    (t) =>
      t.enrichment_status === 'raw' &&
      t.status !== 'cancelled' &&
      t.raw_capture.trim().length > 0,
  );
}

/**
 * Enrich any raw task captures via Claude, writing structured fields back.
 * Designed to be called fire-and-forget on app open and after capture. It is a
 * no-op when nothing is pending, when already running, or when AI is unavailable
 * (tasks simply stay `raw` and are retried next time).
 */
export async function enrichPendingTasks(): Promise<void> {
  if (running) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const all = await db.tasks.toArray();
  const pending = pendingTasks(all);
  if (pending.length === 0) return;

  running = true;
  try {
    const profile = await getProfile();
    const known_context = (profile?.known_context ?? []).map((k) => `${k.key}: ${k.value}`);

    const payload = {
      tasks: pending.slice(0, 25).map((t) => ({
        id: t.id,
        raw_capture: t.raw_capture,
        capture_mode: t.source,
        domain: t.domain_id,
        captured_at: t.created_at,
      })),
      domains: (profile?.domains ?? []).map((d) => ({ id: d.id, name: d.name, weight: d.weight })),
      known_context,
      current_datetime: new Date().toISOString(),
    };

    const res = await fetch('/api/enrich', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // No key configured (503) or transient failure: leave tasks raw, retry later.
    if (!res.ok) return;

    const { results } = (await res.json()) as { results: EnrichmentResult[] };
    if (!Array.isArray(results)) return;

    const now = new Date().toISOString();
    const byId = new Map(results.map((r) => [r.id, r]));
    let wroteDeadline = false;

    for (const task of pending) {
      const r = byId.get(task.id);
      if (!r || !r.enrichment_summary) {
        // Model skipped this task — mark failed so it can be retried explicitly.
        await db.tasks.update(task.id, { enrichment_status: 'failed' });
        continue;
      }

      const updates: Partial<Task> = {
        enrichment_status: 'enriched',
        enrichment_summary: r.enrichment_summary,
        enriched_at: now,
      };

      // Descriptive fields enrichment owns outright.
      if (r.fog_level && VALID_FOG.includes(r.fog_level)) updates.fog_level = r.fog_level;
      if (r.next_action && !task.next_action) updates.next_action = r.next_action;
      if (r.type && VALID_TYPE.includes(r.type) && !task.type) updates.type = r.type;

      // Suggestions only fill where the user left a blank — never overwrite their input.
      if (r.size && VALID_SIZE.includes(r.size) && !task.size) updates.size = r.size;
      if (r.deadline && !task.deadline) {
        const ts = Date.parse(r.deadline);
        if (!Number.isNaN(ts)) {
          updates.deadline = new Date(ts).toISOString();
          updates.deadline_confidence =
            r.deadline_confidence && VALID_CONF.includes(r.deadline_confidence)
              ? r.deadline_confidence
              : 'estimated';
          wroteDeadline = true;
        }
      }

      // Suggested subtasks await explicit confirmation in the task detail view.
      if (Array.isArray(r.suggested_subtasks) && task.subtask_ids.length === 0) {
        updates.suggested_subtasks = r.suggested_subtasks.filter((s) => typeof s === 'string').slice(0, 6);
      }

      // Queue clarifying questions onto the task's clarification history.
      if (Array.isArray(r.questions) && r.questions.length > 0) {
        const existing = new Set(task.clarification_history.map((q) => q.question));
        const newQs: ClarificationEntry[] = r.questions
          .filter((q) => typeof q === 'string' && !existing.has(q))
          .slice(0, 2)
          .map((q) => ({ question: q, answer: null, asked_at: now, answered_at: null }));
        if (newQs.length > 0) {
          updates.clarification_history = [...task.clarification_history, ...newQs];
        }
      }

      await db.tasks.update(task.id, updates);
    }

    // Deadlines may have changed — refresh native importance and the recommendation.
    if (wroteDeadline) await recalculateAllImportance();
    invalidatePrioritisationCache();
  } catch {
    // Network/parse failure — tasks remain raw and are retried on the next trigger.
  } finally {
    running = false;
  }
}
