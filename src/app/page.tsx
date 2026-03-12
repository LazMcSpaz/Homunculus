'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { hasProfile, recalculateAllImportance, logEvent } from '@/lib/actions';
import NavBar from '@/components/layout/NavBar';
import CaptureButton from '@/components/layout/CaptureButton';
import CaptureOverlay from '@/components/capture/CaptureOverlay';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [showCapture, setShowCapture] = useState(false);

  const profile = useLiveQuery(() => db.userProfile.toArray().then(p => p[0]));
  const activeTasks = useLiveQuery(
    () => db.tasks.where('status').anyOf('active', 'in_progress').count(),
  );

  useEffect(() => {
    hasProfile().then((exists) => {
      if (!exists) {
        router.replace('/setup');
      } else {
        recalculateAllImportance();
        logEvent('app_opened', {}, 'system');
        setLoading(false);
      }
    });
  }, [router]);

  if (loading) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <p className="font-label" style={{ color: 'var(--parchment-ink-faint)' }}>Loading...</p>
      </main>
    );
  }

  return (
    <>
      <main style={{ padding: 'var(--space-lg)', maxWidth: 600, margin: '0 auto' }}>
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <h1 className="font-display" style={{ marginBottom: 'var(--space-sm)' }}>
            Homunculus
          </h1>
          <p className="font-body" style={{ color: 'var(--parchment-ink-mid)' }}>
            {profile?.operating_mode === 'crunch' ? 'Crunch mode' : 'Open mode'}
          </p>
        </div>

        <div style={{
          padding: 'var(--space-lg)',
          background: 'var(--surface-card)',
          border: '1px solid var(--parchment-shadow)',
          borderRadius: 'var(--radius-md)',
          borderLeft: '3px solid var(--gold)',
        }}>
          <p className="font-label" style={{ color: 'var(--gold)', marginBottom: 'var(--space-sm)' }}>
            Overview
          </p>
          <p className="font-body" style={{ color: 'var(--parchment-ink-mid)' }}>
            {activeTasks === 0
              ? 'No active tasks. Use the capture button to add your first task.'
              : `${activeTasks} active task${activeTasks === 1 ? '' : 's'}`
            }
          </p>
        </div>
      </main>

      <NavBar />
      <CaptureButton onClick={() => setShowCapture(true)} />
      {showCapture && <CaptureOverlay onClose={() => setShowCapture(false)} />}
    </>
  );
}
