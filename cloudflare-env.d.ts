// Types for the Cloudflare Worker environment bindings.
// Regenerate with `npm run cf-typegen` after changing wrangler.jsonc.

interface CloudflareEnv {
  ASSETS: Fetcher;
  /** KV store for push subscriptions and scheduled reminders. */
  PUSH_KV: KVNamespace;
  /** Anthropic API key — set as a Worker secret, never committed. */
  ANTHROPIC_API_KEY?: string;
  /** VAPID private key (JWK as a JSON string) for Web Push signing. */
  VAPID_PRIVATE_KEY?: string;
  /** mailto: contact for Web Push (optional). */
  VAPID_SUBJECT?: string;
}
