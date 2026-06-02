'use client';

import { useEffect, useState } from 'react';
import {
  isPushSupported,
  getPermission,
  isEnabled,
  enableNotifications,
  disableNotifications,
  sendTestNotification,
} from '@/lib/notifications';
import styles from '@/components/layout/ComingSoon.module.css';

export default function NotificationsSettings() {
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setSupported(isPushSupported());
    setPermission(getPermission());
    setEnabled(isEnabled());
  }, []);

  async function enable() {
    setBusy(true);
    setNote(null);
    try {
      const ok = await enableNotifications();
      setPermission(getPermission());
      setEnabled(ok);
      if (!ok) {
        setNote(
          getPermission() === 'denied'
            ? 'Notifications are blocked in your browser settings.'
            : 'Could not enable notifications. Try again.',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await disableNotifications();
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setNote(null);
    const ok = await sendTestNotification();
    setNote(ok ? 'Test sent — you should see it shortly.' : 'Could not send a test right now.');
  }

  return (
    <div className={styles.card}>
      <p className={styles.cardTitle}>Notifications</p>
      <p className={styles.cardBody}>
        Deadline reminders and a weekly-review nudge, delivered as push
        notifications even when the app is closed.
      </p>

      {!supported && (
        <p className={styles.actionHint} style={{ marginTop: 'var(--space-sm)' }}>
          This browser doesn&rsquo;t support push notifications. On iPhone, add Homunculus to
          your Home Screen first, then enable them here.
        </p>
      )}

      {supported && permission === 'denied' && (
        <p className={styles.actionHint} style={{ marginTop: 'var(--space-sm)' }}>
          Notifications are blocked. Re-enable them in your browser&rsquo;s site settings.
        </p>
      )}

      {supported && permission !== 'denied' && !enabled && (
        <button className={styles.action} onClick={enable} disabled={busy}>
          {busy ? 'Enabling…' : 'Enable notifications'}
          <span className={styles.actionHint}>On iPhone, add to Home Screen first.</span>
        </button>
      )}

      {supported && enabled && (
        <>
          <button className={styles.action} onClick={test} disabled={busy}>
            Send a test notification
          </button>
          <button className={styles.action} onClick={disable} disabled={busy}>
            Turn off notifications
          </button>
        </>
      )}

      {note && (
        <p className={styles.actionHint} style={{ marginTop: 'var(--space-sm)' }}>
          {note}
        </p>
      )}
    </div>
  );
}
