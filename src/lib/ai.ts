import { db } from './db';
import { getProfile } from './actions';
import type { Task, ImportanceLevel, OperatingMode } from './types';

// ─── Response shapes (mirror the API Layer design doc §2.3 / §2.4) ───

export interface OpenRecommendation {
  mode: 'open';
  recommendation: { task_id: string; rationale: string; energy_note?: string };
  also_consider?: { task_id: string; reason: string }[];
  flag_for_advisor?: string[];
}

export type WhatIsNeeded =
  | 'clarify_details'
  | 'confirm_priority'
  | 'set_deadline'
  | 'break_down'
  | 'review_assumptions';

export interface CrunchQueue {
  mode: 'crunch';
  attention_queue: { task_id: string; what_is_needed: WhatIsNeeded; note: string }[];
  flag_for_advisor?: string[];
}

export type PrioritisationResult = (OpenRecommendation | CrunchQueue) & {
  /** True when produced by the native fallback rather than Claude. */
  fallback?: boolean;
  /** True when served from the local 4-hour cache. */
  cached?: boolean;
};

const IMPORTANCE_ORDER: Record<ImportanceLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const CACHE_KEY = 'homunculus.prioritisation';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4-hour staleness floor (design §2.1)
const TIMEOUT_MS = 8000; // prioritisation timeout (design §7.1)

function rankTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const imp = IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance];
    if (imp !== 0) return imp;
    if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });
}

/** Tasks eligible for prioritisation: active/in-progress, not blocked, not snoozed into the future. */
function eligibleTasks(tasks: Task[]): Task[] {
  const now = Date.now();
  return tasks.filter((t) => {
    if (t.status !== 'active' && t.status !== 'in_progress') return false;
    if (t.snoozed_until && new Date(t.snoozed_until).getTime() > now) return false;
    if (t.parent_task_id) return false; // surface parents, not their subtasks
    return true;
  });
}

/** A signature that changes when the recommendation should be invalidated. */
function signature(mode: OperatingMode, tasks: Task[]): string {
  const ids = tasks
    .map((t) => `${t.id}:${t.importance}:${t.deadline ?? ''}`)
    .sort()
    .join('|');
  return `${mode}::${ids}`;
}

function readCache(sig: string): PrioritisationResult | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { sig: cachedSig, at, result } = JSON.parse(raw);
    if (cachedSig !== sig) return null;
    if (Date.now() - at > CACHE_TTL_MS) return null;
    return { ...result, cached: true };
  } catch {
    return null;
  }
}

function writeCache(sig: string, result: PrioritisationResult) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ sig, at: Date.now(), result }));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

/** Clear the cached recommendation (e.g. after capturing or completing a task). */
export function invalidatePrioritisationCache() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* non-fatal */
  }
}

function nativeFallback(mode: OperatingMode, tasks: Task[]): PrioritisationResult {
  const ranked = rankTasks(tasks);
  if (mode === 'crunch') {
    return {
      mode: 'crunch',
      attention_queue: ranked.slice(0, 5).map((t) => ({
        task_id: t.id,
        what_is_needed: !t.deadline ? 'set_deadline' : t.fog_level === 'foggy' ? 'break_down' : 'confirm_priority',
        note:
          t.importance === 'critical' || t.importance === 'high'
            ? 'High importance and awaiting your input.'
            : 'Ranked by importance and deadline.',
      })),
      flag_for_advisor: ranked.filter((t) => t.fog_level === 'foggy').slice(0, 3).map((t) => t.id),
      fallback: true,
    };
  }
  const [top, ...rest] = ranked;
  return {
    mode: 'open',
    recommendation: {
      task_id: top.id,
      rationale: top.deadline
        ? 'Highest priority right now by deadline and importance.'
        : 'Highest priority right now by importance.',
    },
    also_consider: rest.slice(0, 2).map((t) => ({
      task_id: t.id,
      reason: 'Next in line by importance.',
    })),
    flag_for_advisor: ranked.filter((t) => t.fog_level === 'foggy').slice(0, 1).map((t) => t.id),
    fallback: true,
  };
}

/**
 * Ask Homunculus what to focus on next. Tries the Claude prioritisation call,
 * falls back to native ranking on timeout / error / missing API key, and serves
 * a cached result when nothing significant has changed within the 4-hour window.
 */
export async function requestPrioritisation(
  options: { force?: boolean } = {},
): Promise<PrioritisationResult | null> {
  const profile = await getProfile();
  const mode: OperatingMode = profile?.operating_mode ?? 'open';
  const allTasks = await db.tasks.toArray();
  const tasks = eligibleTasks(allTasks);

  if (tasks.length === 0) return null;

  const sig = signature(mode, tasks);
  if (!options.force) {
    const cached = readCache(sig);
    if (cached) return cached;
  }

  const blockedByMap = new Map<string, string[]>();
  for (const t of allTasks) {
    for (const dependentId of t.blocks ?? []) {
      const arr = blockedByMap.get(dependentId) ?? [];
      arr.push(t.id);
      blockedByMap.set(dependentId, arr);
    }
  }

  const payload = {
    mode,
    name: profile && 'name' in profile ? (profile as Record<string, unknown>).name : undefined,
    notification_tone: profile?.notification_calibration?.notification_tone,
    domains: (profile?.domains ?? []).map((d) => ({ id: d.id, name: d.name, weight: d.weight })),
    tasks: tasks.map((t) => ({
      id: t.id,
      summary: t.enrichment_summary || t.title,
      importance: t.importance,
      domain: t.domain_id,
      size: t.size,
      type: t.type,
      fog_level: t.fog_level,
      deadline: t.deadline,
      deadline_confidence: t.deadline_confidence,
      blocked_by: blockedByMap.get(t.id) ?? [],
    })),
    current_datetime: new Date().toISOString(),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('/api/prioritise', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return nativeFallback(mode, tasks);

    const result = (await res.json()) as PrioritisationResult;
    // Guard against a malformed response missing the expected shape.
    const valid =
      (result.mode === 'open' && 'recommendation' in result) ||
      (result.mode === 'crunch' && 'attention_queue' in result);
    if (!valid) return nativeFallback(mode, tasks);

    writeCache(sig, result);
    return result;
  } catch {
    clearTimeout(timer);
    return nativeFallback(mode, tasks);
  }
}
