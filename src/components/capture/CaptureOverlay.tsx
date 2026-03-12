'use client';

import { useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { createTask } from '@/lib/actions';
import type { TaskSize, Domain } from '@/lib/types';
import styles from './Capture.module.css';

interface Props {
  onClose: () => void;
}

export default function CaptureOverlay({ onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rawCapture, setRawCapture] = useState('');
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [deadline, setDeadline] = useState('');
  const [size, setSize] = useState<TaskSize | null>(null);
  const [toast, setToast] = useState<{ text: string; color: string } | null>(null);

  const profile = useLiveQuery(() => db.userProfile.toArray().then(p => p[0]));
  const domains = profile?.domains ?? [];

  const handleSave = useCallback(async () => {
    const task = await createTask({
      raw_capture: rawCapture,
      source: 'manual',
      domain_id: selectedDomainId,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      deadline_confidence: deadline ? 'soft' : null,
      size,
    });

    const domain = domains.find(d => d.id === selectedDomainId);
    setToast({
      text: task.title + (domain ? ` \u00b7 ${domain.name}` : ''),
      color: domain?.color_tag ?? 'var(--gold)',
    });

    setTimeout(() => {
      onClose();
    }, 2000);
  }, [rawCapture, selectedDomainId, deadline, size, domains, onClose]);

  // Step 1: Text input
  if (step === 1) {
    return (
      <div className={styles.overlay}>
        <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        <div className={styles.content}>
          <p className={styles.stepIndicator}>Step 1 of 3</p>
          <h2 className={styles.prompt}>What needs to get done?</h2>
          <textarea
            className={styles.captureInput}
            value={rawCapture}
            onChange={(e) => setRawCapture(e.target.value)}
            placeholder="Describe your task..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && rawCapture.trim()) {
                e.preventDefault();
                setStep(2);
              }
            }}
          />
          <div className={styles.actions}>
            <button
              className={styles.btnPrimary}
              onClick={() => setStep(2)}
              disabled={!rawCapture.trim()}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Domain selection
  if (step === 2) {
    return (
      <div className={styles.overlay}>
        <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        <div className={styles.content}>
          <p className={styles.stepIndicator}>Step 2 of 3</p>
          <h2 className={styles.prompt}>Which area does this belong to?</h2>
          <div className={styles.domainChips}>
            {domains.map((d: Domain) => (
              <button
                key={d.id}
                className={`${styles.domainChip} ${selectedDomainId === d.id ? styles.domainChipSelected : ''}`}
                onClick={() => {
                  setSelectedDomainId(d.id);
                  setTimeout(() => setStep(3), 300);
                }}
              >
                <span className={styles.domainChipDot} style={{ backgroundColor: d.color_tag }} />
                {d.name}
              </button>
            ))}
            <button
              className={styles.skipChip}
              onClick={() => {
                setSelectedDomainId(null);
                setStep(3);
              }}
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Optional deadline + size
  return (
    <div className={styles.overlay}>
      <button className={styles.closeBtn} onClick={onClose}>&times;</button>
      <div className={styles.content}>
        <p className={styles.stepIndicator}>Step 3 of 3</p>
        <h2 className={styles.prompt}>Any details? (optional)</h2>

        <div className={styles.detailsRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Deadline</label>
            <input
              type="date"
              className={styles.dateInput}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Size</label>
            <div className={styles.sizeChips}>
              {(['moment', 'project', 'someday'] as TaskSize[]).map((s) => (
                <button
                  key={s}
                  className={`${styles.sizeChip} ${size === s ? styles.sizeChipSelected : ''}`}
                  onClick={() => setSize(size === s ? null : s)}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.btnSkip} onClick={handleSave}>
            Skip
          </button>
          <button className={styles.btnPrimary} onClick={handleSave}>
            Save
          </button>
        </div>
      </div>

      {toast && (
        <div className={styles.toast}>
          <span className={styles.toastDot} style={{ backgroundColor: toast.color }} />
          <span className={styles.toastText}>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
