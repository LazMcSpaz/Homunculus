/* Homunculus — Core Data Model */

// ─── Enums ───────────────────────────────────────────────

export type TaskSize = 'moment' | 'project' | 'someday';
export type TaskType = 'obligation' | 'investment' | 'enjoyment';
export type TaskStatus = 'active' | 'in_progress' | 'completed' | 'cancelled' | 'someday_parked';
export type ImportanceLevel = 'low' | 'medium' | 'high' | 'critical';
export type DeadlineConfidence = 'hard' | 'soft' | 'estimated';
export type FogLevel = 'clear' | 'hazy' | 'foggy';
export type EnrichmentStatus = 'raw' | 'enriched' | 'failed';
export type OperatingMode = 'open' | 'crunch';
export type CaptureSource = 'manual' | 'voice';

// ─── Domain ──────────────────────────────────────────────

export interface Domain {
  id: string;
  name: string;
  description: string;
  weight: number; // 1–5
  color_tag: string;
}

// ─── Task ────────────────────────────────────────────────

export interface ClarificationEntry {
  question: string;
  answer: string | null;
  asked_at: string; // ISO timestamp
  answered_at: string | null;
}

export interface Task {
  id: string;
  title: string;
  raw_capture: string;
  source: CaptureSource;
  created_at: string; // ISO timestamp
  captured_via: string;

  // Classification
  domain_id: string | null;
  importance: ImportanceLevel;
  importance_manual: ImportanceLevel | null; // explicit user override (floor)
  size: TaskSize | null;
  type: TaskType | null;

  // Structure
  parent_task_id: string | null;
  subtask_ids: string[];
  blocks: string[]; // task IDs that depend on this task

  // Timing
  deadline: string | null; // ISO timestamp
  deadline_confidence: DeadlineConfidence | null;
  recurrence_rule: string | null;
  next_instance_date: string | null;
  earliest_start: string | null;
  snoozed_until: string | null;

  // Completion
  status: TaskStatus;
  completed_at: string | null;
  actual_duration: number | null; // minutes

  // Clarification
  clarification_history: ClarificationEntry[];

  // Enrichment
  enrichment_status: EnrichmentStatus;
  enrichment_summary: string | null;

  // Intelligence
  fog_level: FogLevel;
  next_action: string | null;
}

// ─── Task Instance (recurring) ───────────────────────────

export interface TaskInstance {
  id: string;
  parent_task_id: string;
  due_date: string; // ISO timestamp
  status: 'pending' | 'completed' | 'skipped';
  completed_at: string | null;
}

// ─── User Profile ────────────────────────────────────────

export interface ActiveHours {
  morning: boolean;
  afternoon: boolean;
  evening: boolean;
  late_night: boolean;
}

export interface Momentum {
  streak: number;
  average_per_day: number;
}

export interface NotificationCalibration {
  ignored_streak: number;
  last_engaged: string | null; // ISO timestamp
  preferred_channels: string[];
  notification_tone: 'send_them' | 'be_selective' | 'minimal';
}

export interface UserProfile {
  id: string;
  domains: Domain[];
  operating_mode: OperatingMode;

  // Working style (from setup)
  active_hours: ActiveHours;
  preferred_session_length: 'short_bursts' | 'medium_sessions' | 'long_blocks' | 'unpredictable';
  engagement_style: 'one_at_a_time' | 'few_in_parallel' | 'reactive' | 'depends_on_mode';
  mode_rhythm: 'distinct_crunch_open' | 'mostly_consistent' | 'primarily_reactive';

  // Behavioral patterns (learned over time)
  momentum: Momentum;
  avoidance_signals: number; // count of consecutive avoidance events
  notification_calibration: NotificationCalibration;
  question_engagement_rate: number; // 0-1
  fog_patterns: string[];
  known_context: KnownContextEntry[];

  setup_completed: boolean;
}

export interface KnownContextEntry {
  key: string;
  value: string;
  source: 'setup' | 'conversation' | 'inferred';
  created_at: string;
}

// ─── Interaction Event ───────────────────────────────────

export type InteractionEventType =
  | 'app_opened'
  | 'task_captured'
  | 'task_viewed'
  | 'task_completed'
  | 'task_updated'
  | 'mode_changed'
  | 'notification_sent'
  | 'notification_opened'
  | 'notification_ignored'
  | 'question_answered'
  | 'question_dismissed'
  | 'advisor_session_started'
  | 'advisor_session_ended'
  | 'weekly_review_completed'
  | 'setup_completed';

export interface InteractionEvent {
  id: string;
  occurred_at: string; // ISO timestamp
  event_type: InteractionEventType;
  payload: Record<string, unknown>;
  source: 'user' | 'system' | 'ai';
  mode: OperatingMode;
}

// ─── Domain color palette ────────────────────────────────

export const DOMAIN_COLORS = [
  '#8B2A2A', // wax-seal red
  '#B8860B', // gold
  '#2A5A4A', // forest green
  '#4A3A8B', // royal purple
  '#6B4A2A', // warm brown
  '#2A4A6B', // deep blue
  '#8B6A2A', // amber
  '#5A2A6B', // plum
  '#2A6B5A', // teal
  '#6B2A4A', // burgundy
] as const;
