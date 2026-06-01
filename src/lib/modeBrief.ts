import { db } from './db';
import { getProfile } from './actions';
import type { Task, ImportanceLevel, OperatingMode } from './types';

export interface ModeBrief {
  brief_text: string;
  priority_task_id: string | null;
  attention_items: { task_id: string; reason: string }[];
  fallback?: boolean;
}

const IMPORTANCE_ORDER: Record<ImportanceLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const TIMEOUT_MS = 8000;

function rank(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const imp = IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance];
    if (imp !== 0) return imp;
    if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });
}

function nativeFallback(toMode: OperatingMode, active: Task[], accumulated: number): ModeBrief {
  const ranked = rank(active);
  const top = ranked[0];
  const highCount = active.filter((t) => t.importance === 'high' || t.importance === 'critical').length;
  const text =
    toMode === 'crunch'
      ? `You're in crunch mode. ${highCount > 0 ? `${highCount} task${highCount === 1 ? '' : 's'} need${highCount === 1 ? 's' : ''} attention` : 'Nothing is urgent right now'}${top ? `, starting with "${top.title}".` : '.'}`
      : `You're back in open mode. ${active.length} task${active.length === 1 ? '' : 's'} await${active.length === 1 ? 's' : ''} you${accumulated > 0 ? `, and ${accumulated} new capture${accumulated === 1 ? '' : 's'} came in` : ''}.${top ? ` A good place to resume is "${top.title}".` : ''}`;
  return {
    brief_text: text,
    priority_task_id: top?.id ?? null,
    attention_items: ranked.slice(1, 4).map((t) => ({ task_id: t.id, reason: 'Next by importance.' })),
    fallback: true,
  };
}

/**
 * Request a mode transition brief from Claude, falling back to a native summary
 * on timeout / error / missing key. Returns null if there's nothing to brief on.
 */
export async function requestModeBrief(
  fromMode: OperatingMode,
  toMode: OperatingMode,
): Promise<ModeBrief | null> {
  const profile = await getProfile();
  const all = await db.tasks.toArray();
  const active = all.filter(
    (t) => (t.status === 'active' || t.status === 'in_progress') && !t.parent_task_id,
  );
  const accumulated = all.filter(
    (t) => t.enrichment_status === 'raw' && t.status !== 'cancelled',
  );

  if (active.length === 0 && accumulated.length === 0) return null;

  const summary = (t: Task) => ({
    id: t.id,
    summary: t.enrichment_summary || t.title,
    importance: t.importance,
    domain: t.domain_id,
    deadline: t.deadline,
  });

  const payload = {
    name: profile && 'name' in profile ? (profile as Record<string, unknown>).name : undefined,
    from_mode: fromMode,
    to_mode: toMode,
    domains: (profile?.domains ?? []).map((d) => ({ id: d.id, name: d.name, weight: d.weight })),
    accumulated: accumulated.map(summary),
    high_priority: active
      .filter((t) => t.importance === 'high' || t.importance === 'critical')
      .map(summary),
    current_datetime: new Date().toISOString(),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('/api/mode-brief', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return nativeFallback(toMode, active, accumulated.length);
    const brief = (await res.json()) as ModeBrief;
    if (!brief || typeof brief.brief_text !== 'string') {
      return nativeFallback(toMode, active, accumulated.length);
    }
    return brief;
  } catch {
    clearTimeout(timer);
    return nativeFallback(toMode, active, accumulated.length);
  }
}
