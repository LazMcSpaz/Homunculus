// Resolves the Cloudflare Worker env (bindings + secrets) inside route handlers.
// Returns null when not running on the Cloudflare runtime (e.g. plain `next dev`).
export async function getEnv(): Promise<CloudflareEnv | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    return getCloudflareContext().env;
  } catch {
    return null;
  }
}
