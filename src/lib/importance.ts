import type { Task, Domain, ImportanceLevel } from './types';

const LEVELS: ImportanceLevel[] = ['low', 'medium', 'high', 'critical'];

function levelIndex(level: ImportanceLevel): number {
  return LEVELS.indexOf(level);
}

function elevate(level: ImportanceLevel, steps: number): ImportanceLevel {
  const idx = Math.min(levelIndex(level) + steps, LEVELS.length - 1);
  return LEVELS[idx];
}

function maxLevel(a: ImportanceLevel, b: ImportanceLevel): ImportanceLevel {
  return levelIndex(a) >= levelIndex(b) ? a : b;
}

/**
 * Calculate importance for a task using native arithmetic.
 * Rules from homunculus_intelligence_architecture.docx section 2.2:
 *
 * 1. Hard deadline within 48h → critical (overrides all).
 *    Hard deadline within 7 days → elevate one level.
 *    Soft/estimated deadlines apply half-weight.
 * 2. Domain weight 5 → floor is medium.
 * 3. Each item in blocks[] elevates one level, max high (critical only via deadline).
 * 4. Explicit user signal (importance_manual) is a floor — can go above, never below.
 */
export function calculateImportance(
  task: Task,
  domains: Domain[],
): ImportanceLevel {
  let level: ImportanceLevel = 'low';

  // 1. Deadline proximity
  if (task.deadline && task.deadline_confidence) {
    const now = Date.now();
    const deadlineMs = new Date(task.deadline).getTime();
    const hoursUntil = (deadlineMs - now) / (1000 * 60 * 60);

    if (task.deadline_confidence === 'hard') {
      if (hoursUntil <= 48) {
        level = 'critical';
      } else if (hoursUntil <= 168) { // 7 days
        level = elevate(level, 1);
      }
    } else {
      // soft or estimated: half-weight
      if (hoursUntil <= 48) {
        level = elevate(level, 1);
      }
      // within 7 days for soft/estimated: no change
    }
  }

  // 2. Domain weight
  if (task.domain_id) {
    const domain = domains.find(d => d.id === task.domain_id);
    if (domain && domain.weight === 5) {
      level = maxLevel(level, 'medium');
    }
  }

  // 3. Dependency count (blocks[] length)
  if (task.blocks.length > 0) {
    const elevated = elevate(level, task.blocks.length);
    // Dependencies can elevate to high but not critical
    const capped = levelIndex(elevated) > levelIndex('high') ? 'high' : elevated;
    level = maxLevel(level, capped);
  }

  // 4. Explicit user signal is a floor
  if (task.importance_manual) {
    level = maxLevel(level, task.importance_manual);
  }

  return level;
}
