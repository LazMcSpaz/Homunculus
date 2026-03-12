'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { Task, Domain, ImportanceLevel, TaskSize, TaskType, FogLevel } from '@/lib/types';
import styles from './Tasks.module.css';

const IMPORTANCE_ORDER: Record<ImportanceLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

interface Filters {
  importance: ImportanceLevel | null;
  size: TaskSize | null;
  type: TaskType | null;
  fog: FogLevel | null;
  hasDeadline: boolean | null;
  domain_id: string | null;
  showCompleted: boolean;
}

const DEFAULT_FILTERS: Filters = {
  importance: null,
  size: null,
  type: null,
  fog: null,
  hasDeadline: null,
  domain_id: null,
  showCompleted: false,
};

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const impDiff = IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance];
    if (impDiff !== 0) return impDiff;
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

function applyFilters(tasks: Task[], filters: Filters): Task[] {
  return tasks.filter(t => {
    if (filters.importance && t.importance !== filters.importance) return false;
    if (filters.size && t.size !== filters.size) return false;
    if (filters.type && t.type !== filters.type) return false;
    if (filters.fog && t.fog_level !== filters.fog) return false;
    if (filters.hasDeadline === true && !t.deadline) return false;
    if (filters.hasDeadline === false && t.deadline) return false;
    if (filters.domain_id && t.domain_id !== filters.domain_id) return false;
    return true;
  });
}

function hasActiveFilters(filters: Filters): boolean {
  return filters.importance !== null || filters.size !== null || filters.type !== null ||
    filters.fog !== null || filters.hasDeadline !== null || filters.domain_id !== null;
}

export default function TaskList() {
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'domain' | 'importance'>('domain');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const tasks = useLiveQuery(() => {
    if (filters.showCompleted) {
      return db.tasks.toArray();
    }
    return db.tasks.where('status').anyOf('active', 'in_progress').toArray();
  }, [filters.showCompleted]);

  const profile = useLiveQuery(() => db.userProfile.toArray().then(p => p[0]));
  const domains = profile?.domains ?? [];
  const domainMap = useMemo(() => {
    const map = new Map<string, Domain>();
    for (const d of domains) map.set(d.id, d);
    return map;
  }, [domains]);

  const toggleFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters(prev => ({
      ...prev,
      [key]: prev[key] === value ? null : value,
    }));
  }, []);

  if (!tasks) return null;

  // Search
  const searched = search
    ? tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.raw_capture.toLowerCase().includes(search.toLowerCase()))
    : tasks;

  // Apply filters
  const filtered = applyFilters(searched, filters);

  // Separate someday-parked
  const activeTasks = filtered.filter(t => t.status !== 'someday_parked' && t.status !== 'cancelled');
  const sorted = sortTasks(activeTasks);

  const activeFilterCount = [filters.importance, filters.size, filters.type, filters.fog, filters.hasDeadline, filters.domain_id].filter(v => v !== null).length;

  if (sortMode === 'importance') {
    return (
      <div className={styles.container}>
        <Header sortMode={sortMode} onToggleSort={() => setSortMode('domain')} />
        <SearchBar value={search} onChange={setSearch} />
        <FilterBar
          show={showFilters}
          onToggle={() => setShowFilters(!showFilters)}
          filters={filters}
          onToggleFilter={toggleFilter}
          domains={domains}
          activeCount={activeFilterCount}
          onClear={() => setFilters(DEFAULT_FILTERS)}
          onToggleCompleted={() => setFilters(prev => ({ ...prev, showCompleted: !prev.showCompleted }))}
        />
        {sorted.length === 0 ? (
          <EmptyState hasFilters={hasActiveFilters(filters)} />
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
      <FilterBar
        show={showFilters}
        onToggle={() => setShowFilters(!showFilters)}
        filters={filters}
        onToggleFilter={toggleFilter}
        domains={domains}
        activeCount={activeFilterCount}
        onClear={() => setFilters(DEFAULT_FILTERS)}
        onToggleCompleted={() => setFilters(prev => ({ ...prev, showCompleted: !prev.showCompleted }))}
      />
      {sorted.length === 0 ? (
        <EmptyState hasFilters={hasActiveFilters(filters)} />
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

function FilterBar({
  show,
  onToggle,
  filters,
  onToggleFilter,
  domains,
  activeCount,
  onClear,
  onToggleCompleted,
}: {
  show: boolean;
  onToggle: () => void;
  filters: Filters;
  onToggleFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  domains: Domain[];
  activeCount: number;
  onClear: () => void;
  onToggleCompleted: () => void;
}) {
  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)', alignItems: 'center' }}>
        <button className={styles.filterToggle} onClick={onToggle}>
          Filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
        {activeCount > 0 && (
          <button className={styles.filterToggle} onClick={onClear}>Clear</button>
        )}
        <button
          className={`${styles.filterToggle} ${filters.showCompleted ? styles.filterChipActive : ''}`}
          onClick={onToggleCompleted}
          style={{ marginLeft: 'auto' }}
        >
          {filters.showCompleted ? 'Hide done' : 'Show done'}
        </button>
      </div>
      {show && (
        <div className={styles.filterPanel}>
          <div className={styles.filterGroup}>
            <span className={styles.filterGroupLabel}>Importance</span>
            {(['critical', 'high', 'medium', 'low'] as ImportanceLevel[]).map(i => (
              <button
                key={i}
                className={`${styles.filterChip} ${filters.importance === i ? styles.filterChipActive : ''}`}
                onClick={() => onToggleFilter('importance', i)}
              >{i}</button>
            ))}
          </div>
          <div className={styles.filterGroup}>
            <span className={styles.filterGroupLabel}>Size</span>
            {(['moment', 'project', 'someday'] as TaskSize[]).map(s => (
              <button
                key={s}
                className={`${styles.filterChip} ${filters.size === s ? styles.filterChipActive : ''}`}
                onClick={() => onToggleFilter('size', s)}
              >{s}</button>
            ))}
          </div>
          <div className={styles.filterGroup}>
            <span className={styles.filterGroupLabel}>Type</span>
            {(['obligation', 'investment', 'enjoyment'] as TaskType[]).map(t => (
              <button
                key={t}
                className={`${styles.filterChip} ${filters.type === t ? styles.filterChipActive : ''}`}
                onClick={() => onToggleFilter('type', t)}
              >{t}</button>
            ))}
          </div>
          <div className={styles.filterGroup}>
            <span className={styles.filterGroupLabel}>Fog</span>
            {(['clear', 'hazy', 'foggy'] as FogLevel[]).map(f => (
              <button
                key={f}
                className={`${styles.filterChip} ${filters.fog === f ? styles.filterChipActive : ''}`}
                onClick={() => onToggleFilter('fog', f)}
              >{f}</button>
            ))}
          </div>
          <div className={styles.filterGroup}>
            <span className={styles.filterGroupLabel}>Deadline</span>
            <button
              className={`${styles.filterChip} ${filters.hasDeadline === true ? styles.filterChipActive : ''}`}
              onClick={() => onToggleFilter('hasDeadline', true)}
            >Has deadline</button>
            <button
              className={`${styles.filterChip} ${filters.hasDeadline === false ? styles.filterChipActive : ''}`}
              onClick={() => onToggleFilter('hasDeadline', false)}
            >No deadline</button>
          </div>
          {domains.length > 0 && (
            <div className={styles.filterGroup}>
              <span className={styles.filterGroupLabel}>Domain</span>
              {domains.map(d => (
                <button
                  key={d.id}
                  className={`${styles.filterChip} ${filters.domain_id === d.id ? styles.filterChipActive : ''}`}
                  onClick={() => onToggleFilter('domain_id', d.id)}
                >{d.name}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
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
          {task.fog_level !== 'clear' && (
            <span className={styles.chip}>{task.fog_level}</span>
          )}
          {task.deadline && (
            <span className={styles.deadline}>{formatDeadline(task.deadline)}</span>
          )}
          {task.subtask_ids.length > 0 && (
            <span className={styles.chip}>{task.subtask_ids.length} sub</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyText}>
        {hasFilters ? 'No tasks match these filters.' : 'No tasks yet.'}
      </p>
      <p className={styles.emptyHint}>
        {hasFilters ? 'Try adjusting your filters' : 'Use the capture button to add one'}
      </p>
    </div>
  );
}
