import { NextResponse } from 'next/server';
import { getEnv } from '../../_env';
import { replaceSchedule, type ScheduledNotification } from '@/server/push';

export const dynamic = 'force-dynamic';

interface ScheduleItem {
  dedupe_key: string;
  notification: ScheduledNotification;
}

export async function POST(request: Request) {
  const env = await getEnv();
  if (!env?.PUSH_KV) {
    return NextResponse.json({ error: 'Push not configured', code: 'no_kv' }, { status: 503 });
  }
  let body: { items?: ScheduleItem[] };
  try {
    body = (await request.json()) as { items?: ScheduleItem[] };
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const items = Array.isArray(body.items) ? body.items : [];
  await replaceSchedule(env, items);
  return NextResponse.json({ ok: true, count: items.length });
}
