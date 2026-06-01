'use client';

import { setMode } from '@/lib/actions';
import type { OperatingMode } from '@/lib/types';
import styles from './Home.module.css';

/** Open / Crunch switch — reachable in one tap from home (design: within two taps anywhere). */
export default function ModeToggle({ mode }: { mode: OperatingMode }) {
  return (
    <div className={styles.modeToggle} role="group" aria-label="Operating mode">
      {(['open', 'crunch'] as OperatingMode[]).map((m) => (
        <button
          key={m}
          className={`${styles.modeBtn} ${mode === m ? styles.modeBtnActive : ''}`}
          aria-pressed={mode === m}
          onClick={() => setMode(m)}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
