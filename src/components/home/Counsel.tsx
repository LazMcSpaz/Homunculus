'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { logEvent } from '@/lib/actions';
import { requestPrioritisation, type PrioritisationResult } from '@/lib/ai';
import type { OperatingMode } from '@/lib/types';
import styles from './Home.module.css';

const NEED_LABELS: Record<string, string> = {
  clarify_details: 'Clarify details',
  confirm_priority: 'Confirm priority',
  set_deadline: 'Set a deadline',
  break_down: 'Break it down',
  review_assumptions: 'Review assumptions',
};

export default function Counsel({ mode }: { mode: OperatingMode }) {
  const [result, setResult] = useState<PrioritisationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const tasks = useLiveQuery(() => db.tasks.toArray());
  const titleFor = useCallback(
    (id: string) => tasks?.find((t) => t.id === id)?.title ?? 'Unknown task',
    [tasks],
  );

  const ask = useCallback(
    async (force = false) => {
      setLoading(true);
      try {
        const r = await requestPrioritisation({ force });
        setResult(r);
        if (r) {
          logEvent('prioritisation_call', {
            mode,
            fallback: !!r.fallback,
            cached: !!r.cached,
          }, r.fallback ? 'system' : 'ai');
        }
      } finally {
        setLoading(false);
      }
    },
    [mode],
  );

  const activeCount = tasks?.filter(
    (t) => (t.status === 'active' || t.status === 'in_progress') && !t.parent_task_id,
  ).length ?? 0;

  return (
    <div className={styles.counsel}>
      <p className={styles.counselLabel}>Counsel</p>

      {!result && !loading && (
        <button className={styles.askBtn} onClick={() => ask(false)} disabled={activeCount === 0}>
          {activeCount === 0
            ? 'Nothing to weigh yet'
            : mode === 'crunch'
              ? 'What needs my attention?'
              : 'What should I focus on next?'}
        </button>
      )}

      {loading && <p className={styles.spinner}>Consulting&hellip;</p>}

      {result && !loading && (
        <div className="rise">
          {result.mode === 'open' && (
            <>
              <Link href={`/tasks/${result.recommendation.task_id}`} className={styles.recTask}>
                {titleFor(result.recommendation.task_id)}
              </Link>
              <p className={styles.rationale}>{result.recommendation.rationale}</p>
              {result.recommendation.energy_note && (
                <p className={styles.energyNote}>{result.recommendation.energy_note}</p>
              )}
              {result.also_consider && result.also_consider.length > 0 && (
                <>
                  <p className={styles.alsoLabel}>Also consider</p>
                  {result.also_consider.map((a) => (
                    <Link key={a.task_id} href={`/tasks/${a.task_id}`} className={styles.alsoItem}>
                      <span className={styles.alsoTask}>{titleFor(a.task_id)}</span>
                      <br />
                      <span className={styles.alsoReason}>{a.reason}</span>
                    </Link>
                  ))}
                </>
              )}
            </>
          )}

          {result.mode === 'crunch' && (
            <>
              {result.attention_queue.map((q) => (
                <Link key={q.task_id} href={`/tasks/${q.task_id}`} className={styles.queueItem}>
                  <span className={styles.queueNeed}>{NEED_LABELS[q.what_is_needed] ?? q.what_is_needed}</span>
                  <br />
                  <span className={styles.alsoTask}>{titleFor(q.task_id)}</span>
                  <br />
                  <span className={styles.alsoReason}>{q.note}</span>
                </Link>
              ))}
            </>
          )}

          {result.flag_for_advisor && result.flag_for_advisor.length > 0 && (
            <Link href={`/advisor/${result.flag_for_advisor[0]}`} className={styles.advisorFlag}>
              {result.flag_for_advisor.length === 1
                ? `"${titleFor(result.flag_for_advisor[0])}" looks foggy`
                : 'A few of these look foggy'}{' '}
              — talk it through with the advisor &rarr;
            </Link>
          )}

          <div className={styles.metaRow}>
            {result.fallback && <span className={styles.metaTag}>Offline ranking</span>}
            {result.cached && !result.fallback && <span className={styles.metaTag}>Cached</span>}
            {!result.fallback && !result.cached && <span className={styles.metaTag}>Claude · Haiku</span>}
            <button className={styles.refreshBtn} onClick={() => ask(true)}>
              Ask again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
