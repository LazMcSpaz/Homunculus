import { db } from './db';
import { VAPID_PUBLIC_KEY, REMIND_BEFORE_MS } from './push-config';

const ENABLED_KEY = 'homunculus.pushEnabled';
const MAX_REMINDERS = 20;

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export function isEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(ENABLED_KEY) === '1' && getPermission() === 'granted';
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Request permission, subscribe to push, and register the subscription server-side. */
export async function enableNotifications(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast: lib.dom types the key as a strict ArrayBuffer-backed view.
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    });
  }

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) return false;

  localStorage.setItem(ENABLED_KEY, '1');
  await syncSchedule();
  return true;
}

export async function disableNotifications(): Promise<void> {
  localStorage.removeItem(ENABLED_KEY);
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    // Clear any scheduled reminders for this user.
    await fetch('/api/push/schedule', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    });
  } catch {
    /* best effort */
  }
}

export async function sendTestNotification(): Promise<boolean> {
  const res = await fetch('/api/push/test', { method: 'POST' });
  return res.ok;
}

function nextWeekly(): string {
  // Next Sunday at 17:00 local time.
  const d = new Date();
  d.setHours(17, 0, 0, 0);
  const daysUntilSunday = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + (daysUntilSunday === 0 && Date.now() > d.getTime() ? 7 : daysUntilSunday));
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 7);
  return d.toISOString();
}

/**
 * Recompute upcoming reminders from on-device tasks and push the desired set to
 * the server (replace-all). No-op unless notifications are enabled.
 */
export async function syncSchedule(): Promise<void> {
  if (!isEnabled()) return;
  const now = Date.now();
  const tasks = await db.tasks.where('status').anyOf('active', 'in_progress').toArray();

  const items: { dedupe_key: string; notification: { fire_at: string; title: string; body: string; url?: string } }[] = [];

  for (const t of tasks) {
    if (t.parent_task_id || !t.deadline) continue;
    const deadlineMs = new Date(t.deadline).getTime();
    if (Number.isNaN(deadlineMs) || deadlineMs <= now) continue; // skip overdue
    const fireMs = Math.max(now + 60_000, deadlineMs - REMIND_BEFORE_MS);
    items.push({
      dedupe_key: `deadline:${t.id}`,
      notification: {
        fire_at: new Date(fireMs).toISOString(),
        title: 'Due soon',
        body: t.title,
        url: `/tasks/${t.id}`,
      },
    });
  }

  items.sort((a, b) => a.notification.fire_at.localeCompare(b.notification.fire_at));
  const trimmed = items.slice(0, MAX_REMINDERS);

  // A gentle weekly-review nudge.
  trimmed.push({
    dedupe_key: 'weekly-review',
    notification: {
      fire_at: nextWeekly(),
      title: 'Weekly review',
      body: 'A few minutes to recalibrate?',
      url: '/review',
    },
  });

  try {
    await fetch('/api/push/schedule', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: trimmed }),
    });
  } catch {
    /* non-fatal */
  }
}
