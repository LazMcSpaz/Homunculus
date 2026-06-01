# Deploying Homunculus to Cloudflare

Homunculus runs on **Cloudflare Workers** via the [OpenNext](https://opennext.js.org/cloudflare)
adapter. This guide sets up **automatic deploys on every push to `main`** using
**Cloudflare Workers Builds** (Cloudflare's native CI/CD — no GitHub Actions needed).

## One-time setup

### 1. Set the Anthropic API key as a Worker secret (runtime)

The AI Counsel, enrichment, and advisor calls run server-side; the key is read
at **runtime** via `getCloudflareContext().env`, so it must be a **runtime Worker
secret** (not a build variable). Secrets persist across deploys — Wrangler won't
wipe them.

Set it either in the dashboard or via the CLI:

- **Dashboard:** the `homunculus` Worker → **Settings → Variables and Secrets →
  Add → type "Secret"**, name `ANTHROPIC_API_KEY`, paste your `sk-ant-...` value →
  **Deploy**.
- **CLI:**
  ```bash
  npx wrangler login
  npx wrangler secret put ANTHROPIC_API_KEY
  # paste your key when prompted
  ```

Without it, the app still works — AI calls fall back to native behavior.

### 2. Connect the repo to Workers Builds

In the [Cloudflare dashboard](https://dash.cloudflare.com):

1. **Workers & Pages → Create → Workers → Connect to Git** (or, on an existing
   Worker, **Settings → Builds → Connect**).
2. Select the `LazMcSpaz/Homunculus` repository.
3. Configure the build:
   - **Production branch:** `main`
   - **Build command:** `npm run build:cf`
   - **Deploy command:** `npx wrangler deploy`
   - **Root directory:** `/` (repo root)
4. Save. (No build variables are required — the API key is a *runtime* Worker
   secret from step 1, not a build-time variable.)

That's it. **Every push to `main` now builds and deploys automatically.** Pull
requests get preview deploys too.

## How it works

| Step           | Command                      | What it does                                  |
| -------------- | ---------------------------- | --------------------------------------------- |
| Build          | `npm run build:cf`           | `next build` + OpenNext → `.open-next/worker.js` |
| Deploy         | `npx wrangler deploy`        | Uploads the worker + static assets to Cloudflare |

The Worker config lives in [`wrangler.jsonc`](./wrangler.jsonc) (`nodejs_compat`,
assets binding, observability). The runtime secret `ANTHROPIC_API_KEY` is read in
`src/app/api/*/route.ts` via `getCloudflareContext().env`.

## Manual deploy (anytime)

```bash
npm run deploy     # build + deploy from your machine
npm run preview    # build + run locally in the Workers runtime (workerd)
```

For local AI testing, copy `.dev.vars.example` to `.dev.vars` and add your key.
