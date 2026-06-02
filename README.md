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
- **Claude Haiku 4.5** — powers prioritization, background enrichment, advisor sessions, the weekly review, and mode-transition briefs, all via server-side proxies (the API key never reaches the browser). Every call falls back to native behavior when unavailable.
- **Native intelligence layer** — on-device daily pattern detection (active hours, momentum streak, avoidance signals) and a clarifying-question queue, with zero API cost.
- **Web Push** — deadline reminders and a weekly-review nudge via a service-worker push handler, with subscriptions in Cloudflare **KV** and a **Cron Trigger** flushing due reminders even when the app is closed.
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

### Operating Mode + Transition Brief
Toggle between **Open** and **Crunch** mode in one tap from the home header (or from More). Open mode is for "what's the one next thing"; crunch mode surfaces the queue of tasks needing attention. On a switch, Homunculus shows a short **transition brief** orienting you to the mode you're entering — what's accumulated, what matters first, and a specific first action.

### Clarifying Questions
The questions enrichment generates surface gently at app open — at most two per session, oldest first, gated to high-importance tasks or questions older than a week. Answer or dismiss inline; answers are recorded on the task.

### Weekly Review
A short conversation (not a report) from the Reviews tab: Homunculus leads with what got done, surfaces genuine attention gaps one at a time (skipping the beat entirely if there are none), and checks a few assumptions — writing any confirmed corrections back to your tasks as you go.

### Momentum
A daily on-device pass over your interaction history infers your active hours, completion streak, and avoidance signals (zero API cost). Your current streak shows on the home header.

### Notifications
Opt in from **More → Notifications** to get push reminders before deadlines and a weekly-review nudge — delivered even when the app is closed. Subscriptions are stored server-side in Cloudflare KV; a Cron Trigger sends due reminders; the schedule is recomputed on-device from your tasks and synced on each open. (On iPhone, add Homunculus to the Home Screen first — iOS only allows web push for installed PWAs.)

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
- ~~**Clarifying question queue** — AI-generated questions surfaced at app open, max 2 per session~~ ✅ Done
- ~~**Native intelligence layer** — daily pattern detection (active hours, momentum, avoidance signals), on-device with zero API cost~~ ✅ Done (the notification engine still needs web push — see below)
- ~~**Advisor sessions** — multi-turn conversation to break down foggy tasks~~ ✅ Done
- ~~**Weekly review** — accomplishments, attention gaps, assumption checks~~ ✅ Done
- ~~**Mode transition brief** — forward-facing orientation when switching operating mode~~ ✅ Done
- ~~**Push notifications** — web-push deadline reminders and weekly-review prompts (VAPID + KV + Cron Trigger; on iOS requires the PWA installed to the home screen)~~ ✅ Done
- **Design polish** — parchment noise texture, ornamental dividers, mascot asset slots, animations (largely in place; ongoing)
- **Batch enrichment** — move background enrichment to the async Batch API for ~50% cost savings

## Project Structure

```
src/
├── app/                    # Next.js app router pages
│   ├── layout.tsx          # Root layout: fonts, PWA meta, viewport, SW registration
│   ├── page.tsx            # Home (Counsel + overview + mode toggle)
│   ├── setup/page.tsx      # Onboarding
│   ├── reviews/page.tsx    # Reviews hub (advisor list + weekly review entry)
│   ├── review/page.tsx     # Weekly review conversation
│   ├── more/page.tsx       # Settings, profile, data reset
│   ├── advisor/[id]/       # Multi-turn advisor conversation for a task
│   ├── api/
│   │   ├── _anthropic.ts   # Shared server-side Claude helper (key stays off-device)
│   │   ├── prioritise/     # "What should I focus on next?" call
│   │   ├── enrich/         # Background enrichment of raw captures
│   │   ├── advisor/        # Advisor session turns
│   │   ├── weekly-review/  # Weekly review turns
│   │   ├── mode-brief/     # Mode transition brief
│   │   └── push/           # subscribe / unsubscribe / schedule / test
│   └── tasks/
│       ├── page.tsx        # Task list
│       └── [id]/page.tsx   # Task detail
├── components/
│   ├── advisor/            # Advisor conversation UI
│   ├── review/             # Weekly review conversation UI
│   ├── capture/            # Capture overlay
│   ├── home/               # Counsel, ModeToggle, QuestionPrompt, ModeBriefOverlay
│   ├── layout/             # NavBar, CaptureButton, ServiceWorker, ComingSoon
│   ├── settings/           # NotificationsSettings
│   ├── setup/              # Setup flow steps
│   └── tasks/              # TaskList, TaskDetail
├── server/                 # Worker-runtime modules (not Next-specific)
│   ├── push.ts             # Web Push send + KV subscription/schedule store
│   └── push-cron.ts        # Scheduled flush of due reminders
└── lib/
    ├── actions.ts          # Task/profile CRUD + event logging + setMode + advisor write-back
    ├── ai.ts               # Prioritization: context assembly, cache, fallback
    ├── enrich.ts           # Background enrichment trigger + write-back
    ├── questions.ts        # Clarifying-question queue (gating, answer/dismiss)
    ├── intelligence.ts     # Daily on-device pattern detection
    ├── modeBrief.ts        # Mode transition brief request + fallback
    ├── notifications.ts    # Client push: subscribe/unsubscribe/test + schedule sync
    ├── push-config.ts      # VAPID public key + reminder timing
    ├── db.ts               # Dexie (IndexedDB) schema
    ├── importance.ts       # Native importance calculation
    └── types.ts            # TypeScript types and enums

worker.ts                   # Custom Worker entry: OpenNext fetch + scheduled() cron

public/                     # PWA manifest, generated icons, service worker
wrangler.jsonc              # Cloudflare Worker config
open-next.config.ts         # OpenNext adapter config
scripts/generate-icons.mjs  # Regenerates app icons (no image-lib dependency)
```

## Data Storage

All data is stored in IndexedDB via Dexie and never persisted on a server. The one time data leaves the device is when you tap for Counsel: the relevant active tasks (title, importance, deadline, domain) are sent to Claude for that single request and not stored. To inspect or reset locally: DevTools > Application > IndexedDB > `homunculus` (or use *More → Reset app*). Clearing it resets the app to the setup flow.
