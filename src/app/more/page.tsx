'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { invalidatePrioritisationCache } from '@/lib/ai';
import NavBar from '@/components/layout/NavBar';
import CaptureButton from '@/components/layout/CaptureButton';
import CaptureOverlay from '@/components/capture/CaptureOverlay';
import ModeToggle from '@/components/home/ModeToggle';
import styles from '@/components/layout/ComingSoon.module.css';

export default function MorePage() {
  const router = useRouter();
  const [showCapture, setShowCapture] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const profile = useLiveQuery(() => db.userProfile.toArray().then((p) => p[0]));

  async function resetApp() {
    invalidatePrioritisationCache();
    await db.delete();
    window.location.href = '/';
  }

  if (!profile) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <p className="font-label" style={{ color: 'var(--parchment-ink-faint)' }}>Loading&hellip;</p>
      </main>
    );
  }

  return (
    <>
      <main className={styles.container}>
        <h1 className={styles.title}>More</h1>
        <p className={styles.tagline}>Settings &amp; profile</p>

        <div className={styles.card}>
          <p className={styles.cardTitle}>Operating mode</p>
          <p className={styles.cardBody} style={{ marginBottom: 'var(--space-sm)' }}>
            Open mode surfaces one thing to focus on. Crunch mode shows the queue of
            what needs your input.
          </p>
          <ModeToggle mode={profile.operating_mode} />
        </div>

        <div className={styles.card}>
          <p className={styles.cardTitle}>Domains</p>
          <p className={styles.cardBody}>
            {profile.domains.length > 0
              ? profile.domains.map((d) => `${d.name} (${d.weight})`).join(' · ')
              : 'No domains defined.'}
          </p>
        </div>

        <div className={styles.card}>
          <p className={styles.cardTitle}>Notifications</p>
          <p className={styles.cardBody}>
            Tone: {profile.notification_calibration.notification_tone.replace(/_/g, ' ')}.
            Push notifications are coming soon.
          </p>
          <span className={styles.soon}>Coming soon</span>
        </div>

        <div className={styles.card}>
          <p className={styles.cardTitle}>Your data</p>
          <p className={styles.cardBody}>
            Everything lives on this device, in your browser. Nothing is stored on a
            server — the only time data leaves is when you ask for counsel, which sends
            the relevant tasks to Claude for that single request.
          </p>
        </div>

        {!confirmingReset ? (
          <button
            className={`${styles.action} ${styles.actionDanger}`}
            onClick={() => setConfirmingReset(true)}
          >
            Reset app
            <span className={styles.actionHint}>Erase all tasks and profile, return to setup.</span>
          </button>
        ) : (
          <>
            <button className={`${styles.action} ${styles.actionDanger}`} onClick={resetApp}>
              Yes, erase everything
              <span className={styles.actionHint}>This cannot be undone.</span>
            </button>
            <button className={styles.action} onClick={() => setConfirmingReset(false)}>
              Cancel
            </button>
          </>
        )}
      </main>

      <NavBar />
      <CaptureButton onClick={() => setShowCapture(true)} />
      {showCapture && <CaptureOverlay onClose={() => setShowCapture(false)} />}
    </>
  );
}
