import { NextResponse } from 'next/server';
import { getEnv } from '../../_env';
import { saveSubscription, type PushSubscriptionJSON } from '@/server/push';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const env = await getEnv();
  if (!env?.PUSH_KV) {
    return NextResponse.json({ error: 'Push not configured', code: 'no_kv' }, { status: 503 });
  }
  let body: { subscription?: PushSubscriptionJSON };
  try {
    body = (await request.json()) as { subscription?: PushSubscriptionJSON };
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (!body.subscription?.endpoint) {
    return NextResponse.json({ error: 'Missing subscription' }, { status: 400 });
  }
  try {
    await saveSubscription(env, body.subscription);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
