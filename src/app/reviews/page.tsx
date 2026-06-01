'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import NavBar from '@/components/layout/NavBar';
import CaptureButton from '@/components/layout/CaptureButton';
import CaptureOverlay from '@/components/capture/CaptureOverlay';
import styles from '@/components/layout/ComingSoon.module.css';

export default function ReviewsPage() {
  const [showCapture, setShowCapture] = useState(false);

  // Active tasks the user has flagged (or enrichment flagged) as unclear.
  const foggy = useLiveQuery(() =>
    db.tasks
      .where('status')
      .anyOf('active', 'in_progress')
      .filter((t) => (t.fog_level === 'foggy' || t.fog_level === 'hazy') && !t.parent_task_id)
      .toArray(),
  );

  return (
    <>
      <main className={styles.container}>
        <h1 className={styles.title}>Reviews</h1>
        <p className={styles.tagline}>Reflection &amp; recalibration</p>

        <div className={styles.card}>
          <p className={styles.cardTitle}>Advisor sessions</p>
          <p className={styles.cardBody}>
            When a task is foggy and you can&rsquo;t picture how to proceed, talk it
            through with Homunculus until there&rsquo;s a concrete next step.
          </p>

          {foggy === undefined ? null : foggy.length === 0 ? (
            <p className={styles.actionHint} style={{ marginTop: 'var(--space-sm)' }}>
              Nothing foggy right now. Open any task to talk it through.
            </p>
          ) : (
            <div style={{ marginTop: 'var(--space-sm)' }}>
              {foggy.map((t) => (
                <Link key={t.id} href={`/advisor/${t.id}`} className={styles.action}>
                  {t.title}
                  <span className={styles.actionHint}>
                    {t.fog_level === 'foggy' ? 'Foggy' : 'Hazy'} · tap to talk it through
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <p className={styles.cardTitle}>Weekly review</p>
          <p className={styles.cardBody}>
            A short conversation, not a report: what got done, where attention
            slipped, and which assumptions still hold. It leaves your task list in a
            more accurate state than it started.
          </p>
          <span className={styles.soon}>Coming soon</span>
        </div>
      </main>

      <NavBar />
      <CaptureButton onClick={() => setShowCapture(true)} />
      {showCapture && <CaptureOverlay onClose={() => setShowCapture(false)} />}
    </>
  );
}
