'use client';

import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { completeTask } from '@/lib/actions';
import type { Domain } from '@/lib/types';
import styles from './Tasks.module.css';

interface Props {
  taskId: string;
}

export default function TaskDetail({ taskId }: Props) {
  const router = useRouter();

  const task = useLiveQuery(() => db.tasks.get(taskId), [taskId]);
  const profile = useLiveQuery(() => db.userProfile.toArray().then(p => p[0]));

  if (!task) {
    return (
      <div className={styles.detailContainer}>
        <p className={styles.detailValue}>Task not found.</p>
      </div>
    );
  }

  const domain = profile?.domains.find((d: Domain) => d.id === task.domain_id);

  async function handleComplete() {
    await completeTask(taskId);
    router.push('/tasks');
  }

  return (
    <div className={styles.detailContainer}>
      <button className={styles.backLink} onClick={() => router.push('/tasks')}>
        &larr; Back to tasks
      </button>

      <h1 className={styles.detailTitle}>{task.title}</h1>

      {domain && (
        <div className={styles.detailSection}>
          <div className={styles.detailChips}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: 6, height: 6, borderRadius: '50%',
                  backgroundColor: domain.color_tag, display: 'inline-block',
                }}
              />
              <span className={styles.chip}>{domain.name}</span>
            </span>
          </div>
        </div>
      )}

      <div className={styles.detailSection}>
        <div className={styles.detailChips}>
          <span className={`${styles.chip} ${styles.chipImportance}`}>{task.importance}</span>
          {task.size && <span className={styles.chip}>{task.size}</span>}
          {task.type && <span className={styles.chip}>{task.type}</span>}
          <span className={styles.chip}>{task.enrichment_status}</span>
        </div>
      </div>

      {task.deadline && (
        <div className={styles.detailSection}>
          <div className={styles.detailLabel}>Deadline</div>
          <div className={styles.detailValue}>
            {new Date(task.deadline).toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
            {task.deadline_confidence && ` (${task.deadline_confidence})`}
          </div>
        </div>
      )}

      <div className={styles.divider} />

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

      {task.status !== 'completed' && task.status !== 'cancelled' && (
        <button className={styles.completeBtn} onClick={handleComplete}>
          Mark done
        </button>
      )}

      {task.status === 'completed' && (
        <div className={styles.detailSection}>
          <div className={styles.detailLabel}>Status</div>
          <div className={styles.detailValue}>
            Completed {task.completed_at && `on ${new Date(task.completed_at).toLocaleDateString()}`}
          </div>
        </div>
      )}
    </div>
  );
}
