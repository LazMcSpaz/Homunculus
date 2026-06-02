'use client';

import { useState, useEffect, useCallback } from 'react';
import { getQueuedQuestions, answerQuestion, dismissQuestion, type QueuedQuestion } from '@/lib/questions';
import styles from './Home.module.css';

/**
 * Surfaces queued clarifying questions at app open, one at a time. Honors the
 * per-session cap and gating in lib/questions. Renders nothing when none apply.
 */
export default function QuestionPrompt() {
  const [queue, setQueue] = useState<QueuedQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getQueuedQuestions().then((qs) => {
      setQueue(qs);
      setLoaded(true);
    });
  }, []);

  const current = queue[idx];

  const advance = useCallback(() => {
    setAnswer('');
    setIdx((i) => i + 1);
  }, []);

  const submit = useCallback(async () => {
    if (!current || !answer.trim()) return;
    await answerQuestion(current.taskId, current.question, answer.trim());
    advance();
  }, [current, answer, advance]);

  const skip = useCallback(async () => {
    if (!current) return;
    await dismissQuestion(current.taskId, current.question);
    advance();
  }, [current, advance]);

  if (!loaded || !current) return null;

  return (
    <div className={`${styles.questionCard} rise`}>
      <p className={styles.counselLabel}>A quick question</p>
      <p className={styles.questionText}>{current.question}</p>
      <p className={styles.questionRef}>on &ldquo;{current.taskTitle}&rdquo;</p>
      <input
        className={styles.questionInput}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Your answer..."
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && answer.trim()) submit();
        }}
      />
      <div className={styles.questionActions}>
        <button className={styles.questionSkip} onClick={skip}>Not now</button>
        <button className={styles.questionSubmit} onClick={submit} disabled={!answer.trim()}>
          Answer
        </button>
      </div>
    </div>
  );
}
