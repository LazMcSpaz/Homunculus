'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { hasProfile, recalculateAllImportance, logEvent } from '@/lib/actions';
import { enrichPendingTasks } from '@/lib/enrich';
import NavBar from '@/components/layout/NavBar';
import CaptureButton from '@/components/layout/CaptureButton';
import CaptureOverlay from '@/components/capture/CaptureOverlay';
import Counsel from '@/components/home/Counsel';
import ModeToggle from '@/components/home/ModeToggle';
import styles from '@/components/home/Home.module.css';

function Divider() {
  return (
    <div className={styles.divider} aria-hidden>
      <span className={styles.dividerGlyph}>&#10086;</span>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [showCapture, setShowCapture] = useState(false);

  const profile = useLiveQuery(() => db.userProfile.toArray().then((p) => p[0]));
  const tasks = useLiveQuery(() => db.tasks.where('status').anyOf('active', 'in_progress').toArray());

  useEffect(() => {
    hasProfile().then((exists) => {
      if (!exists) {
        router.replace('/setup');
      } else {
        recalculateAllImportance();
        logEvent('app_opened', {}, 'system');
        // Enrich any raw captures in the background (no-op without an API key).
        enrichPendingTasks();
        setLoading(false);
      }
    });
  }, [router]);

  // Active task counts per domain (top-level tasks only).
  const domainCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let uncategorized = 0;
    for (const t of tasks ?? []) {
      if (t.parent_task_id) continue;
      if (t.domain_id) counts.set(t.domain_id, (counts.get(t.domain_id) ?? 0) + 1);
      else uncategorized += 1;
    }
    return { counts, uncategorized };
  }, [tasks]);

  if (loading || !profile) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <p className="font-label" style={{ color: 'var(--parchment-ink-faint)' }}>Loading&hellip;</p>
      </main>
    );
  }

  const mode = profile.operating_mode;
  const domains = profile.domains ?? [];
  const activeTotal = (tasks ?? []).filter((t) => !t.parent_task_id).length;

  return (
    <>
      <main className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Homunculus</h1>
            <p className={styles.subtitle}>
              {activeTotal === 0 ? 'At rest' : `${activeTotal} active`} &middot; {mode} mode
            </p>
          </div>
          <ModeToggle mode={mode} />
        </div>

        <Counsel mode={mode} />

        <Divider />

        <p className={styles.sectionLabel}>By domain</p>
        {domains.length === 0 && domainCounts.uncategorized === 0 ? (
          <p className={styles.emptyHint}>
            No tasks yet. Use the capture button to add your first.
          </p>
        ) : (
          <>
            {domains.map((d) => (
              <Link key={d.id} href="/tasks" className={styles.domainRow}>
                <span className={styles.domainDot} style={{ backgroundColor: d.color_tag }} />
                <span className={styles.domainName}>{d.name}</span>
                <span className={styles.domainCount}>{domainCounts.counts.get(d.id) ?? 0}</span>
              </Link>
            ))}
            {domainCounts.uncategorized > 0 && (
              <Link href="/tasks" className={styles.domainRow}>
                <span className={styles.domainDot} style={{ backgroundColor: 'var(--parchment-ink-ghost)' }} />
                <span className={styles.domainName}>Uncategorized</span>
                <span className={styles.domainCount}>{domainCounts.uncategorized}</span>
              </Link>
            )}
          </>
        )}
      </main>

      <NavBar />
      <CaptureButton onClick={() => setShowCapture(true)} />
      {showCapture && <CaptureOverlay onClose={() => setShowCapture(false)} />}
    </>
  );
}
