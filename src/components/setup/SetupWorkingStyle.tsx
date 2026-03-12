'use client';

import { useState } from 'react';
import styles from './Setup.module.css';

interface WorkingStyleData {
  activeHours: string;
  sessionLength: string;
  engagementStyle: string;
  modeRhythm: string;
  notificationPref: string;
}

interface Props {
  onComplete: (data: WorkingStyleData) => void;
}

const QUESTIONS = [
  {
    key: 'activeHours' as const,
    label: 'When are you most active?',
    options: ['Morning', 'Afternoon', 'Evening', 'Varies'],
  },
  {
    key: 'sessionLength' as const,
    label: 'How long are your typical work sessions?',
    options: ['Short bursts', 'Medium sessions', 'Long blocks', 'Unpredictable'],
  },
  {
    key: 'engagementStyle' as const,
    label: 'How do you prefer to work on tasks?',
    options: ['One at a time', 'A few in parallel', 'Reactive', 'Depends on mode'],
  },
  {
    key: 'modeRhythm' as const,
    label: 'How does your work rhythm shift?',
    options: ['Distinct crunch and open', 'Mostly consistent', 'Primarily reactive'],
  },
  {
    key: 'notificationPref' as const,
    label: 'How should I handle notifications?',
    options: ['Send them', 'Be selective', 'Minimal'],
  },
];

export default function SetupWorkingStyle({ onComplete }: Props) {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Partial<WorkingStyleData>>({});

  const question = QUESTIONS[currentQ];
  const selectedValue = answers[question.key];

  function selectOption(value: string) {
    const updated = { ...answers, [question.key]: value };
    setAnswers(updated);

    // Auto-advance after a short delay
    setTimeout(() => {
      if (currentQ < QUESTIONS.length - 1) {
        setCurrentQ(currentQ + 1);
      }
    }, 300);
  }

  function handleNext() {
    if (currentQ < QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1);
    } else if (Object.keys(answers).length === QUESTIONS.length) {
      onComplete(answers as WorkingStyleData);
    }
  }

  function handleBack() {
    if (currentQ > 0) {
      setCurrentQ(currentQ - 1);
    }
  }

  const isLast = currentQ === QUESTIONS.length - 1;
  const allAnswered = Object.keys(answers).length === QUESTIONS.length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Homunculus</h1>
        <p className={styles.subtitle}>Let me learn how you work</p>
      </div>

      <p className={styles.stepLabel}>
        Question {currentQ + 1} of {QUESTIONS.length}
      </p>

      <h2 className={styles.question}>{question.label}</h2>

      <div className={styles.chips}>
        {question.options.map((opt) => (
          <button
            key={opt}
            className={`${styles.chip} ${selectedValue === opt ? styles.chipSelected : ''}`}
            onClick={() => selectOption(opt)}
          >
            {opt}
          </button>
        ))}
      </div>

      <div className={styles.navButtons}>
        {currentQ > 0 && (
          <button className={styles.btnSecondary} onClick={handleBack}>
            Back
          </button>
        )}
        <button
          className={styles.btnPrimary}
          onClick={handleNext}
          disabled={!selectedValue || (isLast && !allAnswered)}
        >
          {isLast ? 'Continue' : 'Next'}
        </button>
      </div>
    </div>
  );
}
