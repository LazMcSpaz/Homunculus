'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  completeTask,
  updateTask,
  snoozeTask,
  skipTask,
  cancelTask,
  reactivateTask,
  addSubtask,
  deleteSubtask,
  logEvent,
} from '@/lib/actions';
import type {
  Domain,
  Task,
  TaskSize,
  TaskType,
  ImportanceLevel,
  DeadlineConfidence,
  FogLevel,
} from '@/lib/types';
import styles from './Tasks.module.css';

interface Props {
  taskId: string;
}

type EditingField = null | 'title' | 'domain' | 'size' | 'type' | 'importance' | 'deadline' | 'fog' | 'next_action';

const SIZE_OPTIONS: TaskSize[] = ['moment', 'project', 'someday'];
const TYPE_OPTIONS: TaskType[] = ['obligation', 'investment', 'enjoyment'];
const IMPORTANCE_OPTIONS: ImportanceLevel[] = ['low', 'medium', 'high', 'critical'];
const FOG_OPTIONS: FogLevel[] = ['clear', 'hazy', 'foggy'];
const CONFIDENCE_OPTIONS: DeadlineConfidence[] = ['hard', 'soft', 'estimated'];

export default function TaskDetail({ taskId }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditingField>(null);
  const [editValue, setEditValue] = useState('');
  const [subtaskInput, setSubtaskInput] = useState('');
  const [showSnooze, setShowSnooze] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState('');

  const task = useLiveQuery(() => db.tasks.get(taskId), [taskId]);
  const profile = useLiveQuery(() => db.userProfile.toArray().then(p => p[0]));
  const subtaskIds = task?.subtask_ids ?? [];
  const subtasks = useLiveQuery(
    () => subtaskIds.length > 0
      ? db.tasks.where('id').anyOf(subtaskIds).toArray()
      : Promise.resolve([] as Task[]),
    [subtaskIds.join(',')],
  );

  const domain = profile?.domains.find((d: Domain) => d.id === task?.domain_id);
  const domains = profile?.domains ?? [];

  const startEdit = useCallback((field: EditingField, currentValue: string) => {
    setEditing(field);
    setEditValue(currentValue);
  }, []);

  const saveEdit = useCallback(async (field: string, value: string | null) => {
    if (field === 'title' && value) {
      await updateTask(taskId, { title: value });
    } else if (field === 'domain') {
      await updateTask(taskId, { domain_id: value });
    } else if (field === 'size') {
      await updateTask(taskId, { size: value as TaskSize | null });
    } else if (field === 'type') {
      await updateTask(taskId, { type: value as TaskType | null });
    } else if (field === 'importance') {
      await updateTask(taskId, { importance_manual: value as ImportanceLevel | null });
    } else if (field === 'fog') {
      await updateTask(taskId, { fog_level: (value as FogLevel) ?? 'clear' });
    } else if (field === 'next_action') {
      await updateTask(taskId, { next_action: value || null });
    }
    setEditing(null);
    setEditValue('');
  }, [taskId]);

  const handleDeadlineSave = useCallback(async (date: string, confidence: DeadlineConfidence | null) => {
    await updateTask(taskId, {
      deadline: date ? new Date(date).toISOString() : null,
      deadline_confidence: date ? (confidence ?? 'soft') : null,
    });
    setEditing(null);
  }, [taskId]);

  const handleSnooze = useCallback(async () => {
    if (snoozeDate) {
      await snoozeTask(taskId, new Date(snoozeDate).toISOString());
      setShowSnooze(false);
      setSnoozeDate('');
    }
  }, [taskId, snoozeDate]);

  const handleAddSubtask = useCallback(async () => {
    if (subtaskInput.trim()) {
      await addSubtask(taskId, subtaskInput.trim());
      setSubtaskInput('');
    }
  }, [taskId, subtaskInput]);

  if (!task) {
    return (
      <div className={styles.detailContainer}>
        <p className={styles.detailValue}>Task not found.</p>
      </div>
    );
  }

  const isTerminal = task.status === 'completed' || task.status === 'cancelled';
  const isSnoozed = task.snoozed_until && new Date(task.snoozed_until) > new Date();

  return (
    <div className={styles.detailContainer}>
      <button className={styles.backLink} onClick={() => router.push('/tasks')}>
        &larr; Back to tasks
      </button>

      {/* Status banner for non-active tasks */}
      {task.status !== 'active' && task.status !== 'in_progress' && (
        <div className={styles.statusBanner} data-status={task.status}>
          {task.status === 'completed' && 'Completed'}
          {task.status === 'cancelled' && 'Cancelled'}
          {task.status === 'someday_parked' && 'Parked (someday)'}
          {!isTerminal && task.status !== 'someday_parked' && task.status}
        </div>
      )}

      {isSnoozed && (
        <div className={styles.statusBanner} data-status="snoozed">
          Snoozed until {new Date(task.snoozed_until!).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric',
          })}
        </div>
      )}

      {/* Title — editable */}
      {editing === 'title' ? (
        <div className={styles.editRow}>
          <input
            className={styles.editInput}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit('title', editValue);
              if (e.key === 'Escape') setEditing(null);
            }}
          />
          <button className={styles.editSave} onClick={() => saveEdit('title', editValue)}>Save</button>
          <button className={styles.editCancel} onClick={() => setEditing(null)}>Cancel</button>
        </div>
      ) : (
        <h1
          className={`${styles.detailTitle} ${!isTerminal ? styles.editable : ''}`}
          onClick={() => !isTerminal && startEdit('title', task.title)}
        >
          {task.title}
        </h1>
      )}

      {/* Domain — editable */}
      <div className={styles.detailSection}>
        <div className={styles.detailLabel}>Domain</div>
        {editing === 'domain' ? (
          <div className={styles.chipPicker}>
            {domains.map((d: Domain) => (
              <button
                key={d.id}
                className={`${styles.chip} ${task.domain_id === d.id ? styles.chipSelected : ''}`}
                onClick={() => saveEdit('domain', d.id)}
              >
                <span className={styles.chipDot} style={{ backgroundColor: d.color_tag }} />
                {d.name}
              </button>
            ))}
            <button className={styles.chip} onClick={() => saveEdit('domain', null)}>None</button>
            <button className={styles.editCancel} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        ) : (
          <div
            className={`${styles.detailValue} ${!isTerminal ? styles.editable : ''}`}
            onClick={() => !isTerminal && setEditing('domain')}
          >
            {domain ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className={styles.chipDot} style={{ backgroundColor: domain.color_tag }} />
                {domain.name}
              </span>
            ) : (
              <span className={styles.emptyField}>Tap to set domain</span>
            )}
          </div>
        )}
      </div>

      {/* Classification chips — size, type, importance */}
      <div className={styles.detailSection}>
        <div className={styles.detailLabel}>Classification</div>
        <div className={styles.classificationGrid}>
          {/* Size */}
          <div className={styles.classField}>
            <span className={styles.classFieldLabel}>Size</span>
            {editing === 'size' ? (
              <div className={styles.chipPicker}>
                {SIZE_OPTIONS.map(s => (
                  <button key={s} className={`${styles.chip} ${task.size === s ? styles.chipSelected : ''}`} onClick={() => saveEdit('size', s)}>{s}</button>
                ))}
                <button className={styles.chip} onClick={() => saveEdit('size', null)}>None</button>
              </div>
            ) : (
              <span className={`${styles.chip} ${!isTerminal ? styles.editable : ''}`} onClick={() => !isTerminal && setEditing('size')}>
                {task.size ?? 'unset'}
              </span>
            )}
          </div>
          {/* Type */}
          <div className={styles.classField}>
            <span className={styles.classFieldLabel}>Type</span>
            {editing === 'type' ? (
              <div className={styles.chipPicker}>
                {TYPE_OPTIONS.map(t => (
                  <button key={t} className={`${styles.chip} ${task.type === t ? styles.chipSelected : ''}`} onClick={() => saveEdit('type', t)}>{t}</button>
                ))}
                <button className={styles.chip} onClick={() => saveEdit('type', null)}>None</button>
              </div>
            ) : (
              <span className={`${styles.chip} ${!isTerminal ? styles.editable : ''}`} onClick={() => !isTerminal && setEditing('type')}>
                {task.type ?? 'unset'}
              </span>
            )}
          </div>
          {/* Manual importance override */}
          <div className={styles.classField}>
            <span className={styles.classFieldLabel}>Importance</span>
            {editing === 'importance' ? (
              <div className={styles.chipPicker}>
                {IMPORTANCE_OPTIONS.map(i => (
                  <button key={i} className={`${styles.chip} ${styles.chipImportance} ${task.importance_manual === i ? styles.chipSelected : ''}`} onClick={() => saveEdit('importance', i)}>{i}</button>
                ))}
                <button className={styles.chip} onClick={() => saveEdit('importance', null)}>Auto</button>
              </div>
            ) : (
              <span className={`${styles.chip} ${styles.chipImportance} ${!isTerminal ? styles.editable : ''}`} onClick={() => !isTerminal && setEditing('importance')}>
                {task.importance}{task.importance_manual ? ' (manual)' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Fog level */}
      <div className={styles.detailSection}>
        <div className={styles.detailLabel}>Fog Level</div>
        {editing === 'fog' ? (
          <div className={styles.chipPicker}>
            {FOG_OPTIONS.map(f => (
              <button key={f} className={`${styles.chip} ${task.fog_level === f ? styles.chipSelected : ''}`} onClick={() => saveEdit('fog', f)}>
                {f === 'clear' ? 'Clear' : f === 'hazy' ? 'Hazy' : 'Foggy'}
              </button>
            ))}
          </div>
        ) : (
          <span
            className={`${styles.fogBadge} ${!isTerminal ? styles.editable : ''}`}
            data-fog={task.fog_level}
            onClick={() => !isTerminal && setEditing('fog')}
          >
            {task.fog_level === 'clear' ? 'Clear' : task.fog_level === 'hazy' ? 'Hazy' : 'Foggy'}
          </span>
        )}
      </div>

      {/* Deadline — editable */}
      <div className={styles.detailSection}>
        <div className={styles.detailLabel}>Deadline</div>
        {editing === 'deadline' ? (
          <DeadlineEditor
            currentDate={task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : ''}
            currentConfidence={task.deadline_confidence}
            onSave={handleDeadlineSave}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div
            className={`${styles.detailValue} ${!isTerminal ? styles.editable : ''}`}
            onClick={() => !isTerminal && setEditing('deadline')}
          >
            {task.deadline ? (
              <>
                {new Date(task.deadline).toLocaleDateString('en-US', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                })}
                {task.deadline_confidence && ` (${task.deadline_confidence})`}
              </>
            ) : (
              <span className={styles.emptyField}>Tap to set deadline</span>
            )}
          </div>
        )}
      </div>

      {/* Next action */}
      <div className={styles.detailSection}>
        <div className={styles.detailLabel}>Next Action</div>
        {editing === 'next_action' ? (
          <div className={styles.editRow}>
            <input
              className={styles.editInput}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="What's the next concrete step?"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit('next_action', editValue);
                if (e.key === 'Escape') setEditing(null);
              }}
            />
            <button className={styles.editSave} onClick={() => saveEdit('next_action', editValue)}>Save</button>
            <button className={styles.editCancel} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        ) : (
          <div
            className={`${styles.detailValue} ${!isTerminal ? styles.editable : ''}`}
            onClick={() => !isTerminal && startEdit('next_action', task.next_action ?? '')}
          >
            {task.next_action || <span className={styles.emptyField}>Tap to set next action</span>}
          </div>
        )}
      </div>

      <div className={styles.divider} />

      {/* Subtasks */}
      <div className={styles.detailSection}>
        <div className={styles.detailLabel}>Subtasks</div>
        {subtasks && subtasks.length > 0 && (
          <div className={styles.subtaskList}>
            {subtasks.map((st: Task) => (
              <div key={st.id} className={styles.subtaskItem}>
                <button
                  className={`${styles.subtaskCheck} ${st.status === 'completed' ? styles.subtaskDone : ''}`}
                  onClick={async () => {
                    if (st.status === 'completed') {
                      await reactivateTask(st.id);
                    } else {
                      await completeTask(st.id);
                    }
                  }}
                >
                  {st.status === 'completed' ? '\u2713' : ''}
                </button>
                <span className={`${styles.subtaskTitle} ${st.status === 'completed' ? styles.subtaskTitleDone : ''}`}>
                  {st.title}
                </span>
                {!isTerminal && (
                  <button
                    className={styles.subtaskDelete}
                    onClick={() => deleteSubtask(taskId, st.id)}
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {!isTerminal && (
          <div className={styles.subtaskAdd}>
            <input
              className={styles.subtaskInput}
              value={subtaskInput}
              onChange={(e) => setSubtaskInput(e.target.value)}
              placeholder="Add a subtask..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && subtaskInput.trim()) handleAddSubtask();
              }}
            />
            <button
              className={styles.subtaskAddBtn}
              onClick={handleAddSubtask}
              disabled={!subtaskInput.trim()}
            >
              +
            </button>
          </div>
        )}
      </div>

      <div className={styles.divider} />

      {/* Raw capture */}
      <div className={styles.detailSection}>
        <div className={styles.detailLabel}>Raw Capture</div>
        <div className={styles.rawCapture}>{task.raw_capture}</div>
      </div>

      <div className={styles.detailSection}>
        <div className={styles.detailLabel}>Created</div>
        <div className={styles.detailValue}>
          {new Date(task.created_at).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: 'numeric', minute: '2-digit',
          })}
        </div>
      </div>

      {task.status === 'completed' && (
        <div className={styles.detailSection}>
          <div className={styles.detailLabel}>Completed</div>
          <div className={styles.detailValue}>
            {task.completed_at && new Date(task.completed_at).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
              hour: 'numeric', minute: '2-digit',
            })}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!isTerminal && (
        <div className={styles.actionRow}>
          <button className={styles.completeBtn} onClick={async () => { await completeTask(taskId); router.push('/tasks'); }}>
            Mark done
          </button>

          {!showSnooze ? (
            <button className={styles.actionBtnSecondary} onClick={() => setShowSnooze(true)}>
              Snooze
            </button>
          ) : (
            <div className={styles.snoozeRow}>
              <input
                type="date"
                className={styles.snoozeInput}
                value={snoozeDate}
                onChange={(e) => setSnoozeDate(e.target.value)}
              />
              <button className={styles.editSave} onClick={handleSnooze} disabled={!snoozeDate}>Set</button>
              <button className={styles.editCancel} onClick={() => { setShowSnooze(false); setSnoozeDate(''); }}>Cancel</button>
            </div>
          )}

          <button className={styles.actionBtnSecondary} onClick={async () => { await skipTask(taskId); router.push('/tasks'); }}>
            Park (someday)
          </button>
          <button className={styles.actionBtnDanger} onClick={async () => { await cancelTask(taskId); router.push('/tasks'); }}>
            Cancel task
          </button>
        </div>
      )}

      {/* Reactivate for terminal/parked tasks */}
      {(isTerminal || task.status === 'someday_parked') && (
        <div className={styles.actionRow}>
          <button className={styles.actionBtnSecondary} onClick={async () => { await reactivateTask(taskId); }}>
            Reactivate
          </button>
        </div>
      )}
    </div>
  );
}

/* Inline deadline editor sub-component */
function DeadlineEditor({
  currentDate,
  currentConfidence,
  onSave,
  onCancel,
}: {
  currentDate: string;
  currentConfidence: DeadlineConfidence | null;
  onSave: (date: string, confidence: DeadlineConfidence | null) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(currentDate);
  const [confidence, setConfidence] = useState<DeadlineConfidence | null>(currentConfidence);

  return (
    <div className={styles.deadlineEditor}>
      <input
        type="date"
        className={styles.editInput}
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      {date && (
        <div className={styles.chipPicker}>
          {CONFIDENCE_OPTIONS.map(c => (
            <button
              key={c}
              className={`${styles.chip} ${confidence === c ? styles.chipSelected : ''}`}
              onClick={() => setConfidence(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div className={styles.editRow}>
        <button className={styles.editSave} onClick={() => onSave(date, confidence)}>Save</button>
        {date && <button className={styles.chip} onClick={() => { setDate(''); onSave('', null); }}>Clear deadline</button>}
        <button className={styles.editCancel} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
