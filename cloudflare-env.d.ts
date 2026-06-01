// Types for the Cloudflare Worker environment bindings.
// Regenerate with `npm run cf-typegen` after changing wrangler.jsonc.

interface CloudflareEnv {
  ASSETS: Fetcher;
  /** Anthropic API key — set as a Worker secret, never committed. */
  ANTHROPIC_API_KEY?: string;
}
