import { NextResponse } from 'next/server';
import { getEnv } from '../../_env';
import { sendPushToAll } from '@/server/push';

export const dynamic = 'force-dynamic';

export async function POST() {
  const env = await getEnv();
  if (!env?.PUSH_KV) {
    return NextResponse.json({ error: 'Push not configured', code: 'no_kv' }, { status: 503 });
  }
  if (!env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ error: 'Push key not set', code: 'no_vapid' }, { status: 503 });
  }
  const sent = await sendPushToAll(env, {
    title: 'Homunculus',
    body: 'Notifications are working. I’ll nudge you when something needs you.',
    url: '/',
    tag: 'test',
  });
  return NextResponse.json({ ok: true, sent });
}
