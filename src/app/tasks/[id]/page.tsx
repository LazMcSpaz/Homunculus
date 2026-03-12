'use client';

import { use, useState } from 'react';
import TaskDetail from '@/components/tasks/TaskDetail';
import NavBar from '@/components/layout/NavBar';
import CaptureButton from '@/components/layout/CaptureButton';
import CaptureOverlay from '@/components/capture/CaptureOverlay';

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [showCapture, setShowCapture] = useState(false);

  return (
    <>
      <main>
        <TaskDetail taskId={id} />
      </main>
      <NavBar />
      <CaptureButton onClick={() => setShowCapture(true)} />
      {showCapture && <CaptureOverlay onClose={() => setShowCapture(false)} />}
    </>
  );
}
