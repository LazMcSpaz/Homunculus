# Homunculus

A personal achievement engine that surfaces the right action at the right moment — without keeping you glued to your phone.

Homunculus inverts the typical productivity tool dynamic: instead of you doing all the thinking about what matters most, Homunculus thinks. You capture what needs doing; it handles the mental overhead of juggling multiple life domains, weighing urgency against importance, and knowing what's actually next.

Built as a mobile-first web app for personal use. Not a calendar, not a notes app — a trusted lieutenant that has opinions and expresses them plainly.

## Design

Medieval-classical aesthetic: warm parchment tones, wax-seal red accents, gold highlights, and classical typography (Cormorant Garamond, Crimson Pro, IM Fell English SC). The governing tension is *illuminated manuscript meets precision instrument* — serious and considered, never whimsical.

## Tech Stack

- **Next.js 14** — React framework with app router
- **React 18** + **TypeScript**
- **Dexie** (IndexedDB) — all data lives on-device, nothing leaves your browser
- **Claude AI** (planned) — Haiku for prioritization, task enrichment, and advisor sessions at ~$1.60/month

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

### Access on Your Phone

#### Same Wi-Fi (quickest)

1. Find your computer's local IP:
   - **Mac:** System Settings > Wi-Fi > Details > IP Address
   - **Windows:** Open Command Prompt, run `ipconfig`, look for IPv4 Address
2. Start the dev server on all interfaces:
   ```bash
   npm run dev -- -H 0.0.0.0
   ```
3. On your phone, open `http://<your-ip>:3000`

#### Deploy to Vercel (accessible anywhere)

1. Sign up at [vercel.com](https://vercel.com) with your GitHub account
2. Import the Homunculus repo
3. Deploy — you'll get a URL like `homunculus-xyz.vercel.app`

## Current Features

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

- **AI prioritization** — "What should I focus on next?" Single recommendation in open mode, attention queue in crunch mode
- **Background enrichment** — Claude summarizes raw captures, detects fog, suggests subtasks (runs idle, via Batch API)
- **Clarifying question queue** — AI-generated questions surfaced at app open, max 2 per session
- **Native intelligence layer** — daily pattern detection (active hours, momentum, avoidance signals), notification engine, all on-device with zero API cost
- **Advisor sessions** — multi-turn conversation to break down foggy tasks
- **Weekly review** — accomplishments, attention gaps, assumption checks
- **Design polish** — parchment noise texture, ornamental dividers, mascot asset slots, animations

## Project Structure

```
src/
├── app/                    # Next.js app router pages
│   ├── layout.tsx          # Root layout with fonts
│   ├── page.tsx            # Home (overview)
│   ├── setup/page.tsx      # Onboarding
│   └── tasks/
│       ├── page.tsx        # Task list
│       └── [id]/page.tsx   # Task detail
├── components/
│   ├── capture/            # Capture overlay
│   ├── layout/             # NavBar, CaptureButton
│   ├── setup/              # Setup flow steps
│   └── tasks/              # TaskList, TaskDetail
└── lib/
    ├── actions.ts          # All task/profile CRUD + event logging
    ├── db.ts               # Dexie (IndexedDB) schema
    ├── importance.ts       # Native importance calculation
    └── types.ts            # TypeScript types and enums
```

## Data Storage

All data is stored in IndexedDB via Dexie — nothing leaves your browser. To inspect or reset: DevTools > Application > IndexedDB > `homunculus`. Clearing it resets the app to the setup flow.
