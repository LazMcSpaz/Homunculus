'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { Task, Domain, ImportanceLevel } from '@/lib/types';
import styles from './Tasks.module.css';

const IMPORTANCE_ORDER: Record<ImportanceLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    // By importance first
    const impDiff = IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance];
    if (impDiff !== 0) return impDiff;
    // Then by deadline proximity
    if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });
}

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `${diffDays} days`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TaskList() {
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'domain' | 'importance'>('domain');

  const tasks = useLiveQuery(
    () => db.tasks.where('status').anyOf('active', 'in_progress').toArray(),
  );

  const profile = useLiveQuery(() => db.userProfile.toArray().then(p => p[0]));
  const domains = profile?.domains ?? [];
  const domainMap = useMemo(() => {
    const map = new Map<string, Domain>();
    for (const d of domains) map.set(d.id, d);
    return map;
  }, [domains]);

  if (!tasks) return null;

  // Filter by search
  const filtered = search
    ? tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
    : tasks;

  // Separate someday-parked
  const activeTasks = filtered.filter(t => t.status !== 'someday_parked');
  const sorted = sortTasks(activeTasks);

  if (sortMode === 'importance') {
    return (
      <div className={styles.container}>
        <Header sortMode={sortMode} onToggleSort={() => setSortMode('domain')} />
        <SearchBar value={search} onChange={setSearch} />
        {sorted.length === 0 ? (
          <EmptyState />
        ) : (
          sorted.map(task => (
            <TaskCard key={task.id} task={task} domain={domainMap.get(task.domain_id ?? '')} />
          ))
        )}
      </div>
    );
  }

  // Group by domain
  const groups = new Map<string, Task[]>();
  const ungrouped: Task[] = [];
  for (const task of sorted) {
    if (task.domain_id) {
      const arr = groups.get(task.domain_id) ?? [];
      arr.push(task);
      groups.set(task.domain_id, arr);
    } else {
      ungrouped.push(task);
    }
  }

  return (
    <div className={styles.container}>
      <Header sortMode={sortMode} onToggleSort={() => setSortMode('importance')} />
      <SearchBar value={search} onChange={setSearch} />
      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {domains.map(domain => {
            const domainTasks = groups.get(domain.id);
            if (!domainTasks || domainTasks.length === 0) return null;
            return (
              <div key={domain.id} className={styles.domainGroup}>
                <div className={styles.domainHeader}>
                  <span className={styles.domainDot} style={{ backgroundColor: domain.color_tag }} />
                  <span className={styles.domainLabel}>{domain.name}</span>
                  <span className={styles.domainCount}>{domainTasks.length}</span>
                </div>
                {domainTasks.map(task => (
                  <TaskCard key={task.id} task={task} domain={domain} />
                ))}
              </div>
            );
          })}
          {ungrouped.length > 0 && (
            <div className={styles.domainGroup}>
              <div className={styles.domainHeader}>
                <span className={styles.domainLabel}>Uncategorized</span>
                <span className={styles.domainCount}>{ungrouped.length}</span>
              </div>
              {ungrouped.map(task => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Header({ sortMode, onToggleSort }: { sortMode: string; onToggleSort: () => void }) {
  return (
    <div className={styles.header}>
      <h1 className={styles.title}>Tasks</h1>
      <button className={styles.sortToggle} onClick={onToggleSort}>
        {sortMode === 'domain' ? 'By importance' : 'By domain'}
      </button>
    </div>
  );
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      className={styles.searchInput}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search tasks..."
    />
  );
}

function TaskCard({ task, domain }: { task: Task; domain?: Domain }) {
  const importanceClass =
    task.importance === 'critical' ? styles.taskCardCritical :
    task.importance === 'high' ? styles.taskCardHigh :
    task.importance === 'medium' ? styles.taskCardMedium : '';

  return (
    <Link href={`/tasks/${task.id}`} className={`${styles.taskCard} ${importanceClass}`}>
      <div className={styles.taskBody}>
        <div className={styles.taskTitle}>{task.title}</div>
        <div className={styles.taskMeta}>
          {task.importance !== 'low' && (
            <span className={`${styles.chip} ${styles.chipImportance}`}>{task.importance}</span>
          )}
          {task.size && <span className={styles.chip}>{task.size}</span>}
          {task.deadline && (
            <span className={styles.deadline}>{formatDeadline(task.deadline)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyText}>No tasks yet.</p>
      <p className={styles.emptyHint}>Use the capture button to add one</p>
    </div>
  );
}
