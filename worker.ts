// Custom Worker entry. Re-uses the OpenNext-generated fetch handler and adds a
// scheduled() handler that flushes due push reminders. See OpenNext "Custom
// Worker" guide. This file is bundled by Wrangler (not by Next.js), so it is
// excluded from the Next tsconfig.

// @ts-ignore `.open-next/worker.js` is generated at build time by opennextjs-cloudflare.
import { default as handler } from './.open-next/worker.js';
import { runScheduledPush } from './src/server/push-cron';

export default {
  fetch: handler.fetch,
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledPush(env));
  },
};
