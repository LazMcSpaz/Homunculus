# Deploying Homunculus to Cloudflare

Homunculus runs on **Cloudflare Workers** via the [OpenNext](https://opennext.js.org/cloudflare)
adapter. This guide sets up **automatic deploys on every push to `main`** using
**Cloudflare Workers Builds** (Cloudflare's native CI/CD — no GitHub Actions needed).

## One-time setup

### 1. Set the Anthropic API key as a Worker secret

The AI Counsel and background enrichment calls run server-side; the key never
reaches the browser. Set it once — secrets persist across deploys:

```bash
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
# paste your key (sk-ant-...) when prompted
```

> If the Worker doesn't exist yet, run `npm run deploy` once first to create it,
> then set the secret. (You can also add the secret in the dashboard under the
> Worker's **Settings → Variables and Secrets**.)

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
4. Under **Build variables and secrets**, add `ANTHROPIC_API_KEY` as a secret so
   it's available during the build/deploy. (This is separate from the runtime
   Worker secret in step 1; Workers Builds needs it at deploy time.)
5. Save.

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
