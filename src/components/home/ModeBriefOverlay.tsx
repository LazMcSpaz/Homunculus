'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { requestModeBrief, type ModeBrief } from '@/lib/modeBrief';
import type { OperatingMode } from '@/lib/types';
import styles from './Home.module.css';

/** Shown after a mode change: a forward-facing brief for the mode just entered. */
export default function ModeBriefOverlay({
  fromMode,
  toMode,
  onClose,
}: {
  fromMode: OperatingMode;
  toMode: OperatingMode;
  onClose: () => void;
}) {
  const [brief, setBrief] = useState<ModeBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const tasks = useLiveQuery(() => db.tasks.toArray());
  const titleFor = (id: string) => tasks?.find((t) => t.id === id)?.title ?? 'a task';

  useEffect(() => {
    let alive = true;
    requestModeBrief(fromMode, toMode).then((b) => {
      if (!alive) return;
      setBrief(b);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [fromMode, toMode]);

  return (
    <div className={styles.briefBackdrop} onClick={onClose}>
      <div className={styles.briefCard} onClick={(e) => e.stopPropagation()}>
        <p className={styles.counselLabel}>Now in {toMode} mode</p>

        {loading && <p className={styles.spinner}>Surveying the field&hellip;</p>}

        {!loading && brief && (
          <div className="rise">
            {brief.brief_text.split('\n').filter(Boolean).map((para, i) => (
              <p key={i} className={styles.briefPara}>{para}</p>
            ))}

            {brief.priority_task_id && (
              <Link href={`/tasks/${brief.priority_task_id}`} className={styles.briefPriority} onClick={onClose}>
                Start here: {titleFor(brief.priority_task_id)} &rarr;
              </Link>
            )}

            {brief.attention_items && brief.attention_items.length > 0 && (
              <>
                <p className={styles.alsoLabel}>Also on the horizon</p>
                {brief.attention_items.map((a) => (
                  <Link key={a.task_id} href={`/tasks/${a.task_id}`} className={styles.alsoItem} onClick={onClose}>
                    <span className={styles.alsoTask}>{titleFor(a.task_id)}</span>
                    <br />
                    <span className={styles.alsoReason}>{a.reason}</span>
                  </Link>
                ))}
              </>
            )}

            {brief.fallback && <span className={styles.metaTag}>Offline summary</span>}
          </div>
        )}

        {!loading && !brief && (
          <p className={styles.rationale}>Nothing has accumulated yet — a clean slate.</p>
        )}

        <button className={styles.briefDismiss} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
