import { NextResponse } from 'next/server';
import { getEnv } from '../../_env';
import { removeSubscription } from '@/server/push';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const env = await getEnv();
  if (!env?.PUSH_KV) {
    return NextResponse.json({ error: 'Push not configured', code: 'no_kv' }, { status: 503 });
  }
  let body: { endpoint?: string };
  try {
    body = (await request.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (!body.endpoint) {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
  }
  await removeSubscription(env, body.endpoint);
  return NextResponse.json({ ok: true });
}
