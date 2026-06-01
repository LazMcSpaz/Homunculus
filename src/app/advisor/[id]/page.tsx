'use client';

import { use } from 'react';
import Advisor from '@/components/advisor/Advisor';

export default function AdvisorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Advisor taskId={id} />;
}
