'use client';

import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { DOMAIN_COLORS } from '@/lib/types';
import type { Domain } from '@/lib/types';
import styles from './Setup.module.css';

interface Props {
  onComplete: (domains: Domain[]) => void;
  onBack: () => void;
}

export default function SetupDomains({ onComplete, onBack }: Props) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  function addDomain() {
    if (!name.trim()) return;

    const domain: Domain = {
      id: uuid(),
      name: name.trim(),
      description: description.trim(),
      weight: 3,
      color_tag: DOMAIN_COLORS[domains.length % DOMAIN_COLORS.length],
    };

    setDomains([...domains, domain]);
    setName('');
    setDescription('');
  }

  function removeDomain(id: string) {
    setDomains(domains.filter(d => d.id !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && name.trim()) {
      e.preventDefault();
      addDomain();
    }
  }

  return (
    <div className={styles.container}>
      <p className={styles.stepLabel}>Step 2 of 3</p>
      <h2 className={styles.question}>What areas of your life do you want to manage?</h2>
      <p className={styles.subtitle} style={{ marginBottom: 'var(--space-lg)' }}>
        Add domains like &ldquo;Work&rdquo;, &ldquo;Health&rdquo;, &ldquo;Creative&rdquo;, etc.
      </p>

      <div className={styles.domainForm}>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Domain name</label>
          <input
            type="text"
            className={styles.textInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Work"
          />
        </div>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Description (optional)</label>
          <input
            type="text"
            className={styles.textInput}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Day job responsibilities"
          />
        </div>
        <button
          className={styles.btnSecondary}
          onClick={addDomain}
          disabled={!name.trim()}
          style={{ alignSelf: 'flex-start' }}
        >
          Add domain
        </button>
      </div>

      {domains.length > 0 && (
        <div className={styles.domainList}>
          {domains.map((d) => (
            <div key={d.id} className={styles.domainItem}>
              <div className={styles.domainDot} style={{ backgroundColor: d.color_tag }} />
              <div style={{ flex: 1 }}>
                <div className={styles.domainName}>{d.name}</div>
                {d.description && (
                  <div className={styles.domainDesc}>{d.description}</div>
                )}
              </div>
              <button className={styles.removeBtn} onClick={() => removeDomain(d.id)}>
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.navButtons}>
        <button className={styles.btnSecondary} onClick={onBack}>
          Back
        </button>
        <button
          className={styles.btnPrimary}
          onClick={() => onComplete(domains)}
          disabled={domains.length === 0}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
