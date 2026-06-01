'use client';

import { useState } from 'react';
import NavBar from '@/components/layout/NavBar';
import CaptureButton from '@/components/layout/CaptureButton';
import CaptureOverlay from '@/components/capture/CaptureOverlay';
import styles from '@/components/layout/ComingSoon.module.css';

export default function ReviewsPage() {
  const [showCapture, setShowCapture] = useState(false);

  return (
    <>
      <main className={styles.container}>
        <h1 className={styles.title}>Reviews</h1>
        <p className={styles.tagline}>Reflection &amp; recalibration</p>

        <div className={styles.card}>
          <p className={styles.cardTitle}>Weekly review</p>
          <p className={styles.cardBody}>
            A short conversation, not a report: what got done, where attention
            slipped, and which assumptions still hold. It leaves your task list in a
            more accurate state than it started.
          </p>
          <span className={styles.soon}>Coming soon</span>
        </div>

        <div className={styles.card}>
          <p className={styles.cardTitle}>Advisor sessions</p>
          <p className={styles.cardBody}>
            When a task is foggy and you can&rsquo;t picture how to proceed, talk it
            through with Homunculus until there&rsquo;s a concrete next step.
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
