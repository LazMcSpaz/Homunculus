'use client';

import { useState } from 'react';
import { setMode } from '@/lib/actions';
import type { OperatingMode } from '@/lib/types';
import ModeBriefOverlay from './ModeBriefOverlay';
import styles from './Home.module.css';

/** Open / Crunch switch — reachable in one tap (design: within two taps anywhere). */
export default function ModeToggle({ mode }: { mode: OperatingMode }) {
  const [brief, setBrief] = useState<{ from: OperatingMode; to: OperatingMode } | null>(null);

  async function change(to: OperatingMode) {
    if (to === mode) return;
    const from = mode;
    await setMode(to);
    // On a change, orient the user to the new mode with a transition brief.
    setBrief({ from, to });
  }

  return (
    <>
      <div className={styles.modeToggle} role="group" aria-label="Operating mode">
        {(['open', 'crunch'] as OperatingMode[]).map((m) => (
          <button
            key={m}
            className={`${styles.modeBtn} ${mode === m ? styles.modeBtnActive : ''}`}
            aria-pressed={mode === m}
            onClick={() => change(m)}
          >
            {m}
          </button>
        ))}
      </div>
      {brief && (
        <ModeBriefOverlay fromMode={brief.from} toMode={brief.to} onClose={() => setBrief(null)} />
      )}
    </>
  );
}
