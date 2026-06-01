import { v4 as uuid } from 'uuid';
import { db } from './db';
import { calculateImportance } from './importance';
import type {
  Task,
  TaskStatus,
  UserProfile,
  InteractionEvent,
  InteractionEventType,
  Domain,
  CaptureSource,
  TaskSize,
  DeadlineConfidence,
  OperatingMode,
} from './types';

// ─── Interaction Event Logging ───────────────────────────

export async function logEvent(
  event_type: InteractionEventType,
  payload: Record<string, unknown> = {},
  source: InteractionEvent['source'] = 'user',
): Promise<void> {
  const profile = await getProfile();
  const event: InteractionEvent = {
    id: uuid(),
    occurred_at: new Date().toISOString(),
    event_type,
    payload,
    source,
    mode: profile?.operating_mode ?? 'open',
  };
  await db.interactionEvents.add(event);
}

// ─── Task CRUD ───────────────────────────────────────────

export interface CreateTaskInput {
  raw_capture: string;
  source: CaptureSource;
  domain_id: string | null;
  deadline: string | null;
  deadline_confidence: DeadlineConfidence | null;
  size: TaskSize | null;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const profile = await getProfile();
  const domains = profile?.domains ?? [];

  const task: Task = {
    id: uuid(),
    title: extractTitle(input.raw_capture),
    raw_capture: input.raw_capture,
    source: input.source,
    created_at: new Date().toISOString(),
    captured_via: 'app',

    domain_id: input.domain_id,
    importance: 'low', // will be calculated below
    importance_manual: null,
    size: input.size,
    type: null,

    parent_task_id: null,
    subtask_ids: [],
    blocks: [],

    deadline: input.deadline,
    deadline_confidence: input.deadline_confidence,
    recurrence_rule: null,
    next_instance_date: null,
    earliest_start: null,
    snoozed_until: null,

    status: 'active',
    completed_at: null,
    actual_duration: null,

    clarification_history: [],

    enrichment_status: 'raw',
    enrichment_summary: null,
    enriched_at: null,
    suggested_subtasks: [],

    fog_level: 'clear',
    next_action: null,
  };

  task.importance = calculateImportance(task, domains);

  await db.tasks.add(task);
  await logEvent('task_captured', {
    task_id: task.id,
    capture_mode: input.source,
    raw_length: input.raw_capture.length,
    domain_id: input.domain_id,
  });

  return task;
}

export async function updateTask(
  taskId: string,
  updates: Partial<Pick<Task,
    'title' | 'domain_id' | 'size' | 'type' | 'importance_manual' |
    'deadline' | 'deadline_confidence' | 'fog_level' | 'next_action' | 'snoozed_until'
  >>,
): Promise<void> {
  const profile = await getProfile();
  const domains = profile?.domains ?? [];

  await db.tasks.update(taskId, updates);

  if ('importance_manual' in updates || 'deadline' in updates || 'deadline_confidence' in updates || 'domain_id' in updates) {
    const task = await db.tasks.get(taskId);
    if (task) {
      const newImportance = calculateImportance(task, domains);
      await db.tasks.update(taskId, { importance: newImportance });
    }
  }

  await logEvent('task_updated', { task_id: taskId, fields: Object.keys(updates) });
}

export async function completeTask(taskId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.tasks.update(taskId, {
    status: 'completed' as TaskStatus,
    completed_at: now,
  });

  await logEvent('task_completed', { task_id: taskId, method: 'tap' });
  await recalculateAllImportance();
}

export async function snoozeTask(taskId: string, until: string): Promise<void> {
  await db.tasks.update(taskId, { snoozed_until: until });
  await logEvent('task_updated', { task_id: taskId, field: 'snoozed_until', value: until });
}

export async function skipTask(taskId: string): Promise<void> {
  await db.tasks.update(taskId, { status: 'someday_parked' as TaskStatus });
  await logEvent('task_updated', { task_id: taskId, field: 'status', value: 'someday_parked' });
}

export async function cancelTask(taskId: string): Promise<void> {
  await db.tasks.update(taskId, { status: 'cancelled' as TaskStatus });
  await logEvent('task_updated', { task_id: taskId, field: 'status', value: 'cancelled' });
}

export async function reactivateTask(taskId: string): Promise<void> {
  await db.tasks.update(taskId, {
    status: 'active' as TaskStatus,
    completed_at: null,
    snoozed_until: null,
  });
  await logEvent('task_updated', { task_id: taskId, field: 'status', value: 'active' });
  await recalculateAllImportance();
}

export async function addSubtask(parentId: string, title: string): Promise<Task> {
  const parent = await db.tasks.get(parentId);
  const subtask = await createTask({
    raw_capture: title,
    source: 'manual',
    domain_id: parent?.domain_id ?? null,
    deadline: null,
    deadline_confidence: null,
    size: 'moment',
  });

  await db.tasks.update(subtask.id, { parent_task_id: parentId });
  await db.tasks.update(parentId, {
    subtask_ids: [...(parent?.subtask_ids ?? []), subtask.id],
  });

  return subtask;
}

export async function acceptSuggestedSubtask(parentId: string, label: string): Promise<void> {
  const parent = await db.tasks.get(parentId);
  if (!parent) return;
  await addSubtask(parentId, label);
  await db.tasks.update(parentId, {
    suggested_subtasks: (parent.suggested_subtasks ?? []).filter((s) => s !== label),
  });
}

export async function dismissSuggestedSubtasks(parentId: string): Promise<void> {
  await db.tasks.update(parentId, { suggested_subtasks: [] });
}

// ─── Advisor session write-back ──────────────────────────

export async function applyAdvisorOutcome(
  taskId: string,
  outcome: { next_action?: string; suggested_subtasks?: string[]; new_questions?: string[] },
): Promise<void> {
  const task = await db.tasks.get(taskId);
  if (!task) return;
  const updates: Partial<Task> = {};

  if (outcome.next_action && outcome.next_action !== task.next_action) {
    updates.next_action = outcome.next_action;
  }

  if (Array.isArray(outcome.suggested_subtasks) && outcome.suggested_subtasks.length > 0) {
    // Merge with any existing suggestions, de-duplicated, capped.
    const merged = Array.from(
      new Set([...(task.suggested_subtasks ?? []), ...outcome.suggested_subtasks.filter((s) => typeof s === 'string')]),
    ).slice(0, 8);
    updates.suggested_subtasks = merged;
  }

  if (Array.isArray(outcome.new_questions) && outcome.new_questions.length > 0) {
    const now = new Date().toISOString();
    const existing = new Set(task.clarification_history.map((q) => q.question));
    const additions = outcome.new_questions
      .filter((q) => typeof q === 'string' && !existing.has(q))
      .map((q) => ({ question: q, answer: null, asked_at: now, answered_at: null }));
    if (additions.length > 0) {
      updates.clarification_history = [...task.clarification_history, ...additions];
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.tasks.update(taskId, updates);
  }
}

export async function deleteSubtask(parentId: string, subtaskId: string): Promise<void> {
  const parent = await db.tasks.get(parentId);
  if (parent) {
    await db.tasks.update(parentId, {
      subtask_ids: parent.subtask_ids.filter(id => id !== subtaskId),
    });
  }
  await db.tasks.delete(subtaskId);
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
  await db.tasks.update(taskId, { status });
  await logEvent('task_updated', { task_id: taskId, field: 'status', value: status });
}

export async function getTask(taskId: string): Promise<Task | undefined> {
  return db.tasks.get(taskId);
}

export async function getTasks(filters?: {
  domain_id?: string;
  status?: TaskStatus;
}): Promise<Task[]> {
  let collection = db.tasks.toCollection();

  if (filters?.status) {
    collection = db.tasks.where('status').equals(filters.status);
  }

  const tasks = await collection.toArray();

  if (filters?.domain_id) {
    return tasks.filter(t => t.domain_id === filters.domain_id);
  }

  return tasks;
}

export async function getActiveTasks(): Promise<Task[]> {
  return db.tasks
    .where('status')
    .anyOf('active', 'in_progress')
    .toArray();
}

// ─── Importance Recalculation ────────────────────────────

export async function recalculateAllImportance(): Promise<void> {
  const profile = await getProfile();
  const domains = profile?.domains ?? [];
  const tasks = await getActiveTasks();

  await db.transaction('rw', db.tasks, async () => {
    for (const task of tasks) {
      const newImportance = calculateImportance(task, domains);
      if (newImportance !== task.importance) {
        await db.tasks.update(task.id, { importance: newImportance });
      }
    }
  });
}

// ─── User Profile ────────────────────────────────────────

export async function getProfile(): Promise<UserProfile | undefined> {
  const profiles = await db.userProfile.toArray();
  return profiles[0];
}

export async function createProfile(data: Omit<UserProfile, 'id'>): Promise<UserProfile> {
  const profile: UserProfile = {
    id: uuid(),
    ...data,
  };
  await db.userProfile.add(profile);
  await logEvent('setup_completed', {}, 'system');
  return profile;
}

export async function updateProfile(updates: Partial<UserProfile>): Promise<void> {
  const profile = await getProfile();
  if (profile) {
    await db.userProfile.update(profile.id, updates);
  }
}

export async function setMode(mode: OperatingMode): Promise<void> {
  const profile = await getProfile();
  if (!profile || profile.operating_mode === mode) return;
  const from_mode = profile.operating_mode;
  await db.userProfile.update(profile.id, { operating_mode: mode });
  await logEvent('mode_changed', { from_mode, to_mode: mode });
}

export async function hasProfile(): Promise<boolean> {
  const count = await db.userProfile.count();
  return count > 0;
}

// ─── Helpers ─────────────────────────────────────────────

function extractTitle(raw: string): string {
  // Use the first line or first 80 characters as the title
  const firstLine = raw.split('\n')[0].trim();
  if (firstLine.length <= 80) return firstLine;
  return firstLine.slice(0, 77) + '...';
}
