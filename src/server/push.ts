// Server-side Web Push helpers, shared by the API routes (Next runtime) and the
// scheduled cron handler (raw Worker). Pure — depends only on the Worker env
// (KV + VAPID secret) and @pushforge/builder. No Next.js imports.

import { buildPushHTTPRequest } from '@pushforge/builder';

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface ScheduledNotification {
  fire_at: string; // ISO timestamp
  title: string;
  body: string;
  url?: string;
}

const SUB_PREFIX = 'sub:';
const NOTIF_PREFIX = 'notif:';
const DEFAULT_SUBJECT = 'mailto:notifications@homunculus.app';

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function subKey(endpoint: string): Promise<string> {
  return SUB_PREFIX + (await sha256Hex(endpoint));
}

export function notifKey(dedupeKey: string): string {
  return NOTIF_PREFIX + dedupeKey;
}

// ── Subscriptions ──────────────────────────────────────────

export async function saveSubscription(env: CloudflareEnv, sub: PushSubscriptionJSON): Promise<void> {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new Error('Invalid subscription');
  await env.PUSH_KV.put(await subKey(sub.endpoint), JSON.stringify(sub));
}

export async function removeSubscription(env: CloudflareEnv, endpoint: string): Promise<void> {
  await env.PUSH_KV.delete(await subKey(endpoint));
}

export async function listSubscriptions(env: CloudflareEnv): Promise<PushSubscriptionJSON[]> {
  const subs: PushSubscriptionJSON[] = [];
  let cursor: string | undefined;
  do {
    const res = await env.PUSH_KV.list({ prefix: SUB_PREFIX, cursor });
    for (const k of res.keys) {
      const raw = await env.PUSH_KV.get(k.name);
      if (raw) {
        try {
          subs.push(JSON.parse(raw) as PushSubscriptionJSON);
        } catch {
          /* skip malformed */
        }
      }
    }
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  return subs;
}

// ── Sending ────────────────────────────────────────────────

function vapidPrivateJWK(env: CloudflareEnv): JsonWebKey | null {
  if (!env.VAPID_PRIVATE_KEY) return null;
  try {
    return JSON.parse(env.VAPID_PRIVATE_KEY) as JsonWebKey;
  } catch {
    return null;
  }
}

/** Send a payload to every stored subscription. Prunes subscriptions the push
 *  service reports as gone (404/410). Returns the number sent successfully. */
export async function sendPushToAll(env: CloudflareEnv, payload: PushPayload): Promise<number> {
  const privateJWK = vapidPrivateJWK(env);
  if (!privateJWK) return 0;
  const adminContact = env.VAPID_SUBJECT || DEFAULT_SUBJECT;
  const subs = await listSubscriptions(env);
  let sent = 0;

  await Promise.all(
    subs.map(async (subscription) => {
      try {
        const { endpoint, headers, body } = await buildPushHTTPRequest({
          privateJWK,
          subscription,
          message: {
            // Cast: our payload is plain JSON; pushforge types it as Jsonifiable.
            payload: payload as unknown as Parameters<
              typeof buildPushHTTPRequest
            >[0]['message']['payload'],
            adminContact,
            options: { ttl: 12 * 60 * 60, urgency: 'normal' },
          },
        });
        const res = await fetch(endpoint, { method: 'POST', headers, body });
        if (res.status === 404 || res.status === 410) {
          await removeSubscription(env, subscription.endpoint);
        } else if (res.ok) {
          sent += 1;
        }
      } catch {
        /* one failure shouldn't stop the rest */
      }
    }),
  );
  return sent;
}

// ── Schedule store (replace-all for a single user) ─────────

export async function replaceSchedule(
  env: CloudflareEnv,
  items: { dedupe_key: string; notification: ScheduledNotification }[],
): Promise<void> {
  // Clear existing scheduled notifications, then write the new desired set.
  let cursor: string | undefined;
  const existing: string[] = [];
  do {
    const res = await env.PUSH_KV.list({ prefix: NOTIF_PREFIX, cursor });
    existing.push(...res.keys.map((k: { name: string }) => k.name));
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);

  await Promise.all(existing.map((name) => env.PUSH_KV.delete(name)));
  await Promise.all(
    items
      .filter((i) => i?.dedupe_key && i.notification?.fire_at)
      .map((i) => env.PUSH_KV.put(notifKey(i.dedupe_key), JSON.stringify(i.notification))),
  );
}

export async function listScheduled(
  env: CloudflareEnv,
): Promise<{ key: string; notification: ScheduledNotification }[]> {
  const out: { key: string; notification: ScheduledNotification }[] = [];
  let cursor: string | undefined;
  do {
    const res = await env.PUSH_KV.list({ prefix: NOTIF_PREFIX, cursor });
    for (const k of res.keys) {
      const raw = await env.PUSH_KV.get(k.name);
      if (raw) {
        try {
          out.push({ key: k.name, notification: JSON.parse(raw) as ScheduledNotification });
        } catch {
          /* skip */
        }
      }
    }
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  return out;
}
