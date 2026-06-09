'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { logEvent, updateProfile } from '@/lib/actions';
import type { Task } from '@/lib/types';
import styles from './WeeklyReview.module.css';

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface TaskUpdate {
  task_id: string;
  field: string;
  new_value: unknown;
}

interface ProfileUpdate {
  field: string;
  new_value: unknown;
}

interface ReviewResponse {
  response_text: string;
  beat?: 'accomplishments' | 'attention_gaps' | 'assumption_checks' | 'closing';
  session_state: 'in_progress' | 'complete';
  task_updates?: TaskUpdate[];
  profile_updates?: ProfileUpdate[];
}

const TIMEOUT_MS = 15000; // per-attempt timeout (design §7.1)
const RETRY_DELAYS = [1500, 3000, 4500]; // auto-retry backoff before asking again
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const OPENING = "Let's do my weekly review.";

// Fields the native layer is allowed to write back to a task.
const TASK_FIELD_WHITELIST = [
  'importance_manual',
  'deadline',
  'deadline_confidence',
  'next_action',
  'fog_level',
  'size',
  'type',
  'status',
  'domain_id',
] as const;

export default function WeeklyReview() {
  const router = useRouter();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState(false);
  const [complete, setComplete] = useState(false);
  const startedRef = useRef(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const profile = useLiveQuery(() => db.userProfile.toArray().then((p) => p[0]));
  const allTasks = useLiveQuery(() => db.tasks.toArray());

  // Auto-scroll to the latest message.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const applyWriteBacks = useCallback(
    async (data: ReviewResponse) => {
      for (const u of data.task_updates ?? []) {
        if (!u || typeof u.task_id !== 'string' || typeof u.field !== 'string') continue;
        if (!TASK_FIELD_WHITELIST.includes(u.field as (typeof TASK_FIELD_WHITELIST)[number])) continue;
        try {
          await db.tasks.update(u.task_id, { [u.field]: u.new_value } as Partial<Task>);
        } catch {
          // Ignore individual write failures; keep the review going.
        }
      }
      for (const u of data.profile_updates ?? []) {
        if (!u || u.field !== 'operating_mode') continue;
        if (u.new_value !== 'open' && u.new_value !== 'crunch') continue;
        try {
          await updateProfile({ operating_mode: u.new_value });
        } catch {
          // Ignore.
        }
      }
    },
    [],
  );

  const sendTurn = useCallback(
    async (history: DisplayMessage[]) => {
      if (!profile || !allTasks) return;
      setThinking(true);
      setError(false);

      const domainName = (id: string | null) =>
        id ? profile.domains.find((d) => d.id === id)?.name ?? null : null;

      const now = Date.now();
      const start = new Date(now - WEEK_MS).toISOString();
      const end = new Date(now).toISOString();

      const completed = allTasks
        .filter(
          (t) =>
            t.status === 'completed' &&
            t.completed_at !== null &&
            now - new Date(t.completed_at).getTime() <= WEEK_MS,
        )
        .map((t) => ({
          summary: t.enrichment_summary || t.title,
          domain: domainName(t.domain_id),
          type: t.type,
          importance: t.importance,
        }));

      const active = allTasks
        .filter(
          (t) =>
            (t.status === 'active' || t.status === 'in_progress') &&
            !t.parent_task_id,
        )
        .map((t) => ({
          task_id: t.id,
          summary: t.enrichment_summary || t.title,
          domain: domainName(t.domain_id),
          importance: t.importance,
          deadline: t.deadline,
          enrichment_status: t.enrichment_status,
          unanswered_questions: t.clarification_history.filter(
            (q) => q.answer === null && !q.dismissed_at,
          ).length,
        }));

      const payload = {
        name:
          profile && 'name' in profile
            ? (profile as Record<string, unknown>).name
            : undefined,
        mode: profile.operating_mode ?? 'open',
        domains: profile.domains.map((d) => ({ id: d.id, name: d.name, weight: d.weight })),
        week_summary: { completed, active, date_range: { start, end } },
        messages: history,
      };

      const attempt = async (): Promise<'ok' | 'fatal' | 'retry'> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const res = await fetch('/api/weekly-review', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (res.status === 400) return 'fatal';
          if (!res.ok) return 'retry'; // 429 / 5xx / parse failure / no key (503)
          const data = (await res.json()) as ReviewResponse;
          setMessages((prev) => [...prev, { role: 'assistant', content: data.response_text }]);
          await applyWriteBacks(data);
          if (data.session_state === 'complete') setComplete(true);
          return 'ok';
        } catch {
          clearTimeout(timer);
          return 'retry';
        }
      };

      // Auto-retry with backoff before surfacing the manual retry prompt.
      let result = await attempt();
      for (let i = 0; result === 'retry' && i < RETRY_DELAYS.length; i++) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[i]));
        result = await attempt();
      }
      setThinking(false);
      if (result !== 'ok') setError(true);
    },
    [profile, allTasks, applyWriteBacks],
  );

  const hasTasks = !!allTasks && allTasks.length > 0;

  // Open the session once profile and tasks have loaded (and there is something to review).
  useEffect(() => {
    if (startedRef.current || !profile || !allTasks) return;
    if (allTasks.length === 0) return;
    startedRef.current = true;
    const opening: DisplayMessage = { role: 'user', content: OPENING };
    setMessages([opening]);
    sendTurn([opening]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, allTasks]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || thinking || complete) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    sendTurn(next);
  }, [input, thinking, complete, messages, sendTurn]);

  const handleRetry = useCallback(() => {
    setError(false);
    sendTurn(messages);
  }, [messages, sendTurn]);

  const exit = useCallback(() => {
    if (complete) {
      logEvent('weekly_review_completed', { turns: messages.length });
    }
    router.push('/reviews');
  }, [router, complete, messages.length]);

  // Loading state.
  if (profile === undefined || allTasks === undefined) {
    return (
      <div className={styles.screen}>
        <p className={styles.thinking} style={{ padding: 'var(--space-lg)' }}>
          Loading&hellip;
        </p>
      </div>
    );
  }

  // Empty state — nothing to review.
  if (!hasTasks) {
    return (
      <div className={styles.screen}>
        <header className={styles.header}>
          <div className={styles.headerInfo}>
            <span className={styles.headerLabel}>Weekly review</span>
            <div className={styles.headerTitle}>Reflection</div>
          </div>
          <Link href="/reviews" className={styles.doneBtn}>
            Done
          </Link>
        </header>
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            Nothing to review yet &mdash; come back once you&rsquo;ve captured and completed a few
            things.
          </p>
          <Link href="/reviews" className={styles.backLink}>
            Back to reviews &rarr;
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <span className={styles.headerLabel}>Weekly review</span>
          <div className={styles.headerTitle}>Reflection &amp; recalibration</div>
        </div>
        <button className={styles.doneBtn} onClick={exit}>
          Done
        </button>
      </header>

      <div className={styles.thread} ref={threadRef}>
        {messages.map((m, i) => (
          <div
            key={i}
            className={`${styles.bubble} ${m.role === 'user' ? styles.user : styles.assistant}`}
          >
            {m.content}
          </div>
        ))}

        {thinking && <div className={styles.thinking}>Thinking&hellip;</div>}

        {error && (
          <div className={styles.errorBubble}>
            Taking longer than expected.
            <br />
            <button className={styles.retryBtn} onClick={handleRetry}>
              Tap to retry
            </button>
          </div>
        )}

        {complete && (
          <div className={styles.complete}>
            <span className={styles.completeLabel}>Review complete</span>
            <p className={styles.completeText}>
              Your task list is in a more accurate state than it started.
            </p>
            <button className={styles.backLink} onClick={exit}>
              Back to reviews &rarr;
            </button>
          </div>
        )}
      </div>

      <div className={styles.composer}>
        <textarea
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your reply..."
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!input.trim() || thinking || complete}
        >
          Send
        </button>
      </div>
    </div>
  );
}
