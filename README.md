# Homunculus

A personal achievement engine that surfaces the right action at the right moment — without keeping you glued to your phone.

Homunculus inverts the typical productivity tool dynamic: instead of you doing all the thinking about what matters most, Homunculus thinks. You capture what needs doing; it handles the mental overhead of juggling multiple life domains, weighing urgency against importance, and knowing what's actually next.

Built as a mobile-first web app for personal use. Not a calendar, not a notes app — a trusted lieutenant that has opinions and expresses them plainly.

## Design

Medieval-classical aesthetic: warm parchment tones, wax-seal red accents, gold highlights, and classical typography (Cormorant Garamond, Crimson Pro, IM Fell English SC). The governing tension is *illuminated manuscript meets precision instrument* — serious and considered, never whimsical.

## Tech Stack

- **Next.js 15** — React framework with app router
- **React 18** + **TypeScript**
- **Dexie** (IndexedDB) — all data lives on-device; nothing is stored on a server
- **Claude Haiku 4.5** — powers prioritization ("what should I focus on next?"), background enrichment of raw captures, and multi-turn advisor sessions, via server-side proxies (the API key never reaches the browser). Falls back to native behavior when unavailable. Weekly review is planned.
- **PWA** — installable to your home screen, runs full-screen, works offline (the app shell is cached; your data is already local)
- **Cloudflare Workers** — deployed via the [OpenNext](https://opennext.js.org/cloudflare) adapter

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) v18 or later (LTS recommended)
- [Git](https://git-scm.com)

### Install and Run

```bash
git clone https://github.com/LazMcSpaz/Homunculus.git
cd Homunculus
npm install
npm run dev
```

Open **http://localhost:3000** in your browser. You'll see the setup flow on first visit.

To exercise the Claude prioritization call locally, copy `.dev.vars.example` to `.dev.vars`, add your `ANTHROPIC_API_KEY`, and run `npm run preview` (which runs the app in the Cloudflare Workers runtime). Without a key, the app still works — it falls back to native importance ranking.

### Deploy to Cloudflare (accessible anywhere)

The app deploys to Cloudflare Workers via the OpenNext adapter.

1. Install the [Wrangler](https://developers.cloudflare.com/workers/wrangler/) CLI and authenticate: `npx wrangler login`
2. Set your Anthropic API key as a Worker secret (kept off-device, never committed):
   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   ```
3. Build and deploy:
   ```bash
   npm run deploy
   ```
   You'll get a URL like `https://homunculus.<your-subdomain>.workers.dev`.

You can also connect the GitHub repo in the Cloudflare dashboard for automatic deploys ([Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)) — set `ANTHROPIC_API_KEY` as a build secret there.

### Install on Your Phone

Once it's deployed (or while running on the same Wi-Fi via `npm run dev -- -H 0.0.0.0` and visiting `http://<your-computer-ip>:3000`):

- **iOS Safari:** Share → *Add to Home Screen*
- **Android Chrome:** ⋮ menu → *Install app* / *Add to Home Screen*

It launches full-screen with the wax-seal icon, like a native app.

## Current Features

### Home & Counsel
The home screen shows your active task count, a per-domain overview, and the **Counsel** card. Tap *"What should I focus on next?"* and Homunculus calls Claude to return a single recommendation (open mode) or an attention queue of what needs your input (crunch mode), with a plain-spoken rationale. Results are cached for 4 hours and re-used until something material changes, keeping AI cost low. If the AI is unavailable, it falls back silently to native importance ranking.

### Operating Mode
Toggle between **Open** and **Crunch** mode in one tap from the home header (or from More). Open mode is for "what's the one next thing"; crunch mode surfaces the queue of tasks needing attention.

### Advisor Sessions
When a task is foggy and you can't picture how to proceed, tap **"talk it through"** (on the task, in the Reviews tab, or from a Counsel fog flag) to open a multi-turn conversation. Homunculus asks one question at a time, helps you think rather than thinking for you, and ends the moment the path is clear — writing the agreed **next action**, **suggested steps**, and any new clarifying questions back onto the task.

### Background Enrichment
After you capture a task (and on app open), Homunculus quietly sends raw captures to Claude and writes back a structured understanding: a plain-English **summary** (shown on the task), fog level, type, and — only where you left them blank — size, an inferred deadline, and a next action. It can also propose **suggested steps**, which appear on the task detail for you to add or dismiss with one tap (never created silently). These richer summaries are what the prioritization call then reasons over. Runs only when an API key is configured; otherwise tasks stay as-is.

### Setup Flow
Walk through working style preferences (active hours, session length, engagement style, mode rhythm, notification tone) and define your life domains with descriptions and weights.

### Task Capture
Floating capture button opens a 3-step overlay: describe the task, pick a domain, optionally set deadline and size. Fast enough to capture a thought before it escapes.

### Task List
- **Two views:** grouped by domain or sorted by importance
- **Search:** matches task titles and raw capture text
- **Filter panel:** filter by importance, size, type, fog level, deadline, and domain
- **Show/hide completed:** toggle to review what you've done

### Task Detail
Tap any field to edit it inline:
- Title, domain, size (moment/project/someday), type (obligation/investment/enjoyment)
- Manual importance override (floor — auto-calculation can go higher, never lower)
- Deadline with confidence level (hard/soft/estimated)
- Fog level (clear/hazy/foggy)
- Next action

**Subtasks** — add, check off, delete. Subtasks inherit the parent's domain.

**Actions** — Mark done, Snooze (pick a date), Park (someday), Cancel, Reactivate.

### Importance Engine
Auto-calculates importance from four inputs (no AI needed):
1. Deadline proximity — hard deadline within 48h = critical
2. Domain weight — weight-5 domains floor at medium
3. Dependencies — each blocking task elevates one level (capped at high)
4. Manual override — your signal is a floor, never a ceiling

Recalculates on every app open and task completion.

### Interaction Logging
Every action (capture, complete, edit, snooze, skip, cancel) is logged with timestamps and operating mode for future pattern detection.

## Roadmap

Roughly in order of priority:

- ~~**AI prioritization** — "What should I focus on next?" Single recommendation in open mode, attention queue in crunch mode~~ ✅ Done
- ~~**Background enrichment** — Claude summarizes raw captures, detects fog, suggests subtasks~~ ✅ Done (currently a single batched Messages-API call triggered on capture / app open; moving to the async Batch API for ~50% cost savings is a future optimization)
- **Clarifying question queue** — AI-generated questions surfaced at app open, max 2 per session
- **Native intelligence layer** — daily pattern detection (active hours, momentum, avoidance signals), notification engine, all on-device with zero API cost
- ~~**Advisor sessions** — multi-turn conversation to break down foggy tasks~~ ✅ Done
- **Weekly review** — accomplishments, attention gaps, assumption checks
- **Design polish** — parchment noise texture, ornamental dividers, mascot asset slots, animations

## Project Structure

```
src/
├── app/                    # Next.js app router pages
│   ├── layout.tsx          # Root layout: fonts, PWA meta, viewport, SW registration
│   ├── page.tsx            # Home (Counsel + overview + mode toggle)
│   ├── setup/page.tsx      # Onboarding
│   ├── reviews/page.tsx    # Reviews (weekly review / advisor — coming soon)
│   ├── more/page.tsx       # Settings, profile, data reset
│   ├── advisor/[id]/       # Multi-turn advisor conversation for a task
│   ├── api/
│   │   ├── _anthropic.ts   # Shared server-side Claude helper (key stays off-device)
│   │   ├── prioritise/     # "What should I focus on next?" call
│   │   ├── enrich/         # Background enrichment of raw captures
│   │   └── advisor/        # Advisor session turns
│   └── tasks/
│       ├── page.tsx        # Task list
│       └── [id]/page.tsx   # Task detail
├── components/
│   ├── advisor/            # Advisor conversation UI
│   ├── capture/            # Capture overlay
│   ├── home/               # Counsel card, ModeToggle
│   ├── layout/             # NavBar, CaptureButton, ServiceWorker, ComingSoon
│   ├── setup/              # Setup flow steps
│   └── tasks/              # TaskList, TaskDetail
└── lib/
    ├── actions.ts          # All task/profile CRUD + event logging + setMode
    ├── ai.ts               # Prioritization: context assembly, cache, fallback
    ├── enrich.ts           # Background enrichment trigger + write-back
    ├── db.ts               # Dexie (IndexedDB) schema
    ├── importance.ts       # Native importance calculation
    └── types.ts            # TypeScript types and enums

public/                     # PWA manifest, generated icons, service worker
wrangler.jsonc              # Cloudflare Worker config
open-next.config.ts         # OpenNext adapter config
scripts/generate-icons.mjs  # Regenerates app icons (no image-lib dependency)
```

## Data Storage

All data is stored in IndexedDB via Dexie and never persisted on a server. The one time data leaves the device is when you tap for Counsel: the relevant active tasks (title, importance, deadline, domain) are sent to Claude for that single request and not stored. To inspect or reset locally: DevTools > Application > IndexedDB > `homunculus` (or use *More → Reset app*). Clearing it resets the app to the setup flow.
