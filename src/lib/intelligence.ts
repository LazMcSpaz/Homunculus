import { db } from './db';
import { getProfile, updateProfile } from './actions';
import type { ActiveHours, InteractionEvent } from './types';

// Native intelligence layer (homunculus_intelligence_architecture.docx §02).
// Runs at most once per day, entirely on-device, no API calls. Reads the
// interaction log and refreshes behavioural summary fields on the User Profile.

const RUN_KEY = 'homunculus.patternRun';
const WINDOW_DAYS = 90;
const AVOIDANCE_THRESHOLD = 5; // consecutive skips/snoozes per domain (changes doc)

function ranToday(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(RUN_KEY) === new Date().toDateString();
}

function markRan() {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(RUN_KEY, new Date().toDateString());
}

function bucketForHour(hour: number): keyof ActiveHours {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late_night';
}

function computeActiveHours(events: InteractionEvent[]): ActiveHours {
  const counts = { morning: 0, afternoon: 0, evening: 0, late_night: 0 };
  let total = 0;
  for (const e of events) {
    if (e.event_type !== 'app_opened' && e.event_type !== 'task_completed' && e.event_type !== 'task_captured') {
      continue;
    }
    counts[bucketForHour(new Date(e.occurred_at).getHours())] += 1;
    total += 1;
  }
  if (total === 0) {
    return { morning: true, afternoon: true, evening: true, late_night: false };
  }
  // A window is "active" if it holds a meaningful share of activity.
  const threshold = Math.max(2, total * 0.15);
  return {
    morning: counts.morning >= threshold,
    afternoon: counts.afternoon >= threshold,
    evening: counts.evening >= threshold,
    late_night: counts.late_night >= threshold,
  };
}

function computeMomentum(events: InteractionEvent[]): { streak: number; average_per_day: number } {
  const completions = events.filter((e) => e.event_type === 'task_completed');
  // Days (local) that had at least one completion.
  const days = new Set(completions.map((e) => new Date(e.occurred_at).toDateString()));

  let streak = 0;
  const cursor = new Date();
  // Allow today to be empty without breaking a streak that ran through yesterday.
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const last7 = completions.filter((e) => new Date(e.occurred_at).getTime() >= weekAgo).length;
  const average_per_day = Math.round((last7 / 7) * 10) / 10;

  return { streak, average_per_day };
}

async function computeAvoidanceSignals(events: InteractionEvent[]): Promise<number> {
  // Skips/snoozes grouped by the task's domain; a domain crossing the threshold
  // registers as an avoidance signal.
  const deferrals = events.filter(
    (e) =>
      e.event_type === 'task_updated' &&
      (e.payload?.value === 'someday_parked' || e.payload?.field === 'snoozed_until'),
  );
  if (deferrals.length === 0) return 0;

  const taskIds = Array.from(new Set(deferrals.map((e) => String(e.payload?.task_id ?? '')).filter(Boolean)));
  const tasks = await db.tasks.where('id').anyOf(taskIds).toArray();
  const domainByTask = new Map(tasks.map((t) => [t.id, t.domain_id ?? 'none']));

  const perDomain = new Map<string, number>();
  for (const e of deferrals) {
    const domain = domainByTask.get(String(e.payload?.task_id ?? '')) ?? 'none';
    perDomain.set(domain, (perDomain.get(domain) ?? 0) + 1);
  }
  let signals = 0;
  for (const count of perDomain.values()) {
    if (count >= AVOIDANCE_THRESHOLD) signals += 1;
  }
  return signals;
}

/**
 * Refresh behavioural summary fields on the profile from the interaction log.
 * Self-guarded to run at most once per calendar day. Safe to call on app open.
 */
export async function runDailyPatternDetection(): Promise<void> {
  if (ranToday()) return;
  const profile = await getProfile();
  if (!profile) return;

  const windowStart = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const events = (await db.interactionEvents.toArray()).filter(
    (e) => new Date(e.occurred_at).getTime() >= windowStart,
  );

  const active_hours = computeActiveHours(events);
  const momentum = computeMomentum(events);
  const avoidance_signals = await computeAvoidanceSignals(events);

  await updateProfile({ active_hours, momentum, avoidance_signals });
  markRan();
}
