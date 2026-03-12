'use client';

import styles from './CaptureButton.module.css';

interface Props {
  onClick: () => void;
}

export default function CaptureButton({ onClick }: Props) {
  return (
    <button className={styles.button} onClick={onClick} aria-label="Capture new task">
      <span className={styles.icon}>+</span>
    </button>
  );
}
