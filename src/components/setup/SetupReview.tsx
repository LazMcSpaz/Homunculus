'use client';

import type { Domain } from '@/lib/types';
import styles from './Setup.module.css';

interface WorkingStyleData {
  activeHours: string;
  sessionLength: string;
  engagementStyle: string;
  modeRhythm: string;
  notificationPref: string;
}

interface Props {
  workingStyle: WorkingStyleData;
  domains: Domain[];
  onUpdateDomainWeight: (id: string, weight: number) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export default function SetupReview({
  workingStyle,
  domains,
  onUpdateDomainWeight,
  onConfirm,
  onBack,
}: Props) {
  return (
    <div className={styles.container}>
      <p className={styles.stepLabel}>Step 3 of 3</p>
      <h2 className={styles.question}>Review your profile</h2>
      <p className={styles.subtitle} style={{ marginBottom: 'var(--space-lg)' }}>
        Adjust domain weights to indicate relative importance (1-5).
      </p>

      <div className={styles.reviewSection}>
        <div className={styles.reviewLabel}>Working Style</div>
        <div className={styles.reviewValue}>
          <strong>Active hours:</strong> {workingStyle.activeHours}
        </div>
        <div className={styles.reviewValue}>
          <strong>Sessions:</strong> {workingStyle.sessionLength}
        </div>
        <div className={styles.reviewValue}>
          <strong>Engagement:</strong> {workingStyle.engagementStyle}
        </div>
        <div className={styles.reviewValue}>
          <strong>Mode rhythm:</strong> {workingStyle.modeRhythm}
        </div>
        <div className={styles.reviewValue}>
          <strong>Notifications:</strong> {workingStyle.notificationPref}
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.reviewSection}>
        <div className={styles.reviewLabel}>Domains</div>
        <div className={styles.domainList}>
          {domains.map((d) => (
            <div key={d.id} className={styles.domainItem}>
              <div className={styles.domainDot} style={{ backgroundColor: d.color_tag }} />
              <div style={{ flex: 1 }}>
                <div className={styles.domainName}>{d.name}</div>
              </div>
              <div className={styles.weightControl}>
                <button
                  className={styles.weightBtn}
                  onClick={() => onUpdateDomainWeight(d.id, Math.max(1, d.weight - 1))}
                  disabled={d.weight <= 1}
                >
                  &minus;
                </button>
                <span className={styles.weightValue}>{d.weight}</span>
                <button
                  className={styles.weightBtn}
                  onClick={() => onUpdateDomainWeight(d.id, Math.min(5, d.weight + 1))}
                  disabled={d.weight >= 5}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.navButtons}>
        <button className={styles.btnSecondary} onClick={onBack}>
          Back
        </button>
        <button className={styles.btnPrimary} onClick={onConfirm}>
          Confirm
        </button>
      </div>
    </div>
  );
}
