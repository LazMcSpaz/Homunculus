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

export async function completeTask(taskId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.tasks.update(taskId, {
    status: 'completed' as TaskStatus,
    completed_at: now,
  });

  await logEvent('task_completed', {
    task_id: taskId,
    method: 'tap',
  });

  // Recalculate importance for tasks that depended on this one
  await recalculateAllImportance();
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
