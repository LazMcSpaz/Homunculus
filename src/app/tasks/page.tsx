'use client';

import { useState } from 'react';
import TaskList from '@/components/tasks/TaskList';
import NavBar from '@/components/layout/NavBar';
import CaptureButton from '@/components/layout/CaptureButton';
import CaptureOverlay from '@/components/capture/CaptureOverlay';

export default function TasksPage() {
  const [showCapture, setShowCapture] = useState(false);

  return (
    <>
      <main>
        <TaskList />
      </main>
      <NavBar />
      <CaptureButton onClick={() => setShowCapture(true)} />
      {showCapture && <CaptureOverlay onClose={() => setShowCapture(false)} />}
    </>
  );
}
