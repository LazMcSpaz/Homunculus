/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;

// Enables `getCloudflareContext()` (and Worker bindings like ANTHROPIC_API_KEY)
// to work during `next dev`. No effect on the production build.
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
initOpenNextCloudflareForDev();
