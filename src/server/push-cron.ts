// Scheduled (cron) push flush. Invoked from worker.ts's scheduled() handler.
// Sends any reminders whose fire_at has passed, then removes them.

import { listScheduled, sendPushToAll } from './push';

export async function runScheduledPush(env: CloudflareEnv): Promise<void> {
  if (!env?.PUSH_KV || !env?.VAPID_PRIVATE_KEY) return;
  const now = Date.now();
  const scheduled = await listScheduled(env);

  for (const { key, notification } of scheduled) {
    if (new Date(notification.fire_at).getTime() > now) continue;
    await sendPushToAll(env, {
      title: notification.title,
      body: notification.body,
      url: notification.url,
      tag: key,
    });
    await env.PUSH_KV.delete(key);
  }
}
