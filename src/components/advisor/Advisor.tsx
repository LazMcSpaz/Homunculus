'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { applyAdvisorOutcome, logEvent } from '@/lib/actions';
import type { Task } from '@/lib/types';
import styles from './Advisor.module.css';

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AdvisorResponse {
  response_text: string;
  session_state: 'in_progress' | 'resolved' | 'needs_more_info';
  next_action?: string;
  suggested_subtasks?: string[];
  new_questions?: string[];
}

const TIMEOUT_MS = 15000; // per-attempt timeout (design §7.1)
// Backoff between automatic retries — ~9s of self-retrying before asking again.
const RETRY_DELAYS = [1500, 3000, 4500];

export default function Advisor({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [resolved, setResolved] = useState(false);
  const startedRef = useRef(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const task = useLiveQuery(() => db.tasks.get(taskId), [taskId]);
  const profile = useLiveQuery(() => db.userProfile.toArray().then((p) => p[0]));
  const subtaskIds = task?.subtask_ids ?? [];
  const subtasks = useLiveQuery(
    () =>
      subtaskIds.length > 0
        ? db.tasks.where('id').anyOf(subtaskIds).toArray()
        : Promise.resolve([] as Task[]),
    [subtaskIds.join(',')],
  );

  // Auto-scroll to the latest message.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const sendTurn = useCallback(
    async (history: DisplayMessage[]) => {
      if (!task) return;
      setThinking(true);
      setError(false);
      setNotConfigured(false);

      const domainName = profile?.domains.find((d) => d.id === task.domain_id)?.name ?? null;
      const payload = {
        task: {
          summary: task.enrichment_summary || task.title,
          domain: domainName,
          importance: task.importance,
          deadline: task.deadline,
          fog_level: task.fog_level,
          questions_asked: task.clarification_history.map((q) => ({
            question: q.question,
            answer: q.answer,
          })),
          subtasks: (subtasks ?? []).map((s) => s.title),
        },
        name: profile && 'name' in profile ? (profile as Record<string, unknown>).name : undefined,
        mode: profile?.operating_mode ?? 'open',
        known_context: (profile?.known_context ?? []).map((k) => `${k.key}: ${k.value}`),
        messages: history,
      };

      // One attempt. Returns the disposition so the caller can decide to retry.
      const attempt = async (): Promise<'ok' | 'config' | 'fatal' | 'retry'> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const res = await fetch('/api/advisor', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (res.status === 503) return 'config';
          if (res.status === 400) return 'fatal';
          if (!res.ok) return 'retry'; // 429 / 5xx / parse failure upstream
          const data = (await res.json()) as AdvisorResponse;
          setMessages((prev) => [...prev, { role: 'assistant', content: data.response_text }]);
          await applyAdvisorOutcome(taskId, {
            next_action: data.next_action,
            suggested_subtasks: data.suggested_subtasks,
            new_questions: data.new_questions,
          });
          if (data.session_state === 'resolved') setResolved(true);
          return 'ok';
        } catch {
          clearTimeout(timer);
          return 'retry'; // network error / timeout
        }
      };

      // Auto-retry with backoff (~9s of waiting) before asking the user again.
      let result = await attempt();
      for (let i = 0; result === 'retry' && i < RETRY_DELAYS.length; i++) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[i]));
        result = await attempt();
      }

      setThinking(false);
      if (result === 'config') setNotConfigured(true);
      else if (result !== 'ok') setError(true);
    },
    [task, profile, subtasks, taskId],
  );

  // Open the session once the task has loaded.
  useEffect(() => {
    if (startedRef.current || !task) return;
    startedRef.current = true;
    const opening: DisplayMessage = {
      role: 'user',
      content: `I'm stuck on this and need to think it through: ${task.enrichment_summary || task.title}`,
    };
    logEvent('advisor_session_started', { task_id: taskId });
    setMessages([opening]);
    sendTurn([opening]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || thinking) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    sendTurn(next);
  }, [input, thinking, messages, sendTurn]);

  const handleRetry = useCallback(() => {
    setError(false);
    sendTurn(messages);
  }, [messages, sendTurn]);

  const exit = useCallback(() => {
    logEvent('advisor_session_ended', { task_id: taskId, turns: messages.length, resolved });
    router.push(`/tasks/${taskId}`);
  }, [router, taskId, messages.length, resolved]);

  if (!task) {
    return (
      <div className={styles.screen}>
        <p className={styles.thinking} style={{ padding: 'var(--space-lg)' }}>Loading&hellip;</p>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <span className={styles.headerLabel}>Advisor</span>
          <div className={styles.headerTitle}>{task.title}</div>
        </div>
        <button className={styles.doneBtn} onClick={exit}>Done</button>
      </header>

      <div className={styles.thread} ref={threadRef}>
        {messages.map((m, i) => (
          <div key={i} className={`${styles.bubble} ${m.role === 'user' ? styles.user : styles.advisor}`}>
            {m.content}
          </div>
        ))}

        {thinking && <div className={styles.thinking}>Thinking&hellip;</div>}

        {error && (
          <div className={styles.errorBubble}>
            Taking longer than expected.
            <br />
            <button className={styles.retryBtn} onClick={handleRetry}>Tap to retry</button>
          </div>
        )}

        {notConfigured && (
          <div className={styles.errorBubble}>
            The advisor needs the Claude API key set on the server before it can think
            this through. Once that&rsquo;s in place, come back and I&rsquo;ll help.
          </div>
        )}

        {resolved && (
          <div className={styles.resolved}>
            <span className={styles.resolvedLabel}>Path is clear</span>
            <p className={styles.resolvedText}>
              {task.next_action
                ? `Next action set: ${task.next_action}`
                : 'You know what to do next.'}
            </p>
            <button className={styles.backToTask} onClick={exit}>Back to the task &rarr;</button>
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
        <button className={styles.sendBtn} onClick={handleSend} disabled={!input.trim() || thinking}>
          Send
        </button>
      </div>
    </div>
  );
}
