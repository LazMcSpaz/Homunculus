import Dexie, { type Table } from 'dexie';
import type { Task, TaskInstance, UserProfile, InteractionEvent } from './types';

export class HomunculusDB extends Dexie {
  tasks!: Table<Task, string>;
  taskInstances!: Table<TaskInstance, string>;
  userProfile!: Table<UserProfile, string>;
  interactionEvents!: Table<InteractionEvent, string>;

  constructor() {
    super('homunculus');

    this.version(1).stores({
      tasks: 'id, domain_id, status, importance, created_at, deadline, parent_task_id, enrichment_status',
      taskInstances: 'id, parent_task_id, due_date, status',
      userProfile: 'id',
      interactionEvents: 'id, occurred_at, event_type',
    });
  }
}

export const db = new HomunculusDB();
