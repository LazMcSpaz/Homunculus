'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Domain, ActiveHours, UserProfile } from '@/lib/types';
import { createProfile } from '@/lib/actions';
import SetupWorkingStyle from './SetupWorkingStyle';
import SetupDomains from './SetupDomains';
import SetupReview from './SetupReview';

interface WorkingStyleData {
  activeHours: string;
  sessionLength: string;
  engagementStyle: string;
  modeRhythm: string;
  notificationPref: string;
}

function parseActiveHours(selection: string): ActiveHours {
  switch (selection) {
    case 'Morning':
      return { morning: true, afternoon: false, evening: false, late_night: false };
    case 'Afternoon':
      return { morning: false, afternoon: true, evening: false, late_night: false };
    case 'Evening':
      return { morning: false, afternoon: false, evening: true, late_night: false };
    case 'Varies':
    default:
      return { morning: true, afternoon: true, evening: true, late_night: false };
  }
}

function parseSessionLength(s: string): UserProfile['preferred_session_length'] {
  const map: Record<string, UserProfile['preferred_session_length']> = {
    'Short bursts': 'short_bursts',
    'Medium sessions': 'medium_sessions',
    'Long blocks': 'long_blocks',
    'Unpredictable': 'unpredictable',
  };
  return map[s] ?? 'medium_sessions';
}

function parseEngagementStyle(s: string): UserProfile['engagement_style'] {
  const map: Record<string, UserProfile['engagement_style']> = {
    'One at a time': 'one_at_a_time',
    'A few in parallel': 'few_in_parallel',
    'Reactive': 'reactive',
    'Depends on mode': 'depends_on_mode',
  };
  return map[s] ?? 'one_at_a_time';
}

function parseModeRhythm(s: string): UserProfile['mode_rhythm'] {
  const map: Record<string, UserProfile['mode_rhythm']> = {
    'Distinct crunch and open': 'distinct_crunch_open',
    'Mostly consistent': 'mostly_consistent',
    'Primarily reactive': 'primarily_reactive',
  };
  return map[s] ?? 'mostly_consistent';
}

function parseNotificationTone(s: string): UserProfile['notification_calibration']['notification_tone'] {
  const map: Record<string, UserProfile['notification_calibration']['notification_tone']> = {
    'Send them': 'send_them',
    'Be selective': 'be_selective',
    'Minimal': 'minimal',
  };
  return map[s] ?? 'be_selective';
}

export default function SetupFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<1 | 2 | 3>(1);
  const [workingStyle, setWorkingStyle] = useState<WorkingStyleData | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);

  function handleWorkingStyleComplete(data: WorkingStyleData) {
    setWorkingStyle(data);
    setPhase(2);
  }

  function handleDomainsComplete(newDomains: Domain[]) {
    setDomains(newDomains);
    setPhase(3);
  }

  function handleUpdateDomainWeight(id: string, weight: number) {
    setDomains(domains.map(d => d.id === id ? { ...d, weight } : d));
  }

  async function handleConfirm() {
    if (!workingStyle) return;

    const profile: Omit<UserProfile, 'id'> = {
      domains,
      operating_mode: 'open',
      active_hours: parseActiveHours(workingStyle.activeHours),
      preferred_session_length: parseSessionLength(workingStyle.sessionLength),
      engagement_style: parseEngagementStyle(workingStyle.engagementStyle),
      mode_rhythm: parseModeRhythm(workingStyle.modeRhythm),
      momentum: { streak: 0, average_per_day: 0 },
      avoidance_signals: 0,
      notification_calibration: {
        ignored_streak: 0,
        last_engaged: null,
        preferred_channels: [],
        notification_tone: parseNotificationTone(workingStyle.notificationPref),
      },
      question_engagement_rate: 1,
      fog_patterns: [],
      known_context: [],
      setup_completed: true,
    };

    await createProfile(profile);
    router.replace('/');
  }

  if (phase === 1) {
    return <SetupWorkingStyle onComplete={handleWorkingStyleComplete} />;
  }

  if (phase === 2) {
    return (
      <SetupDomains
        onComplete={handleDomainsComplete}
        onBack={() => setPhase(1)}
      />
    );
  }

  return (
    <SetupReview
      workingStyle={workingStyle!}
      domains={domains}
      onUpdateDomainWeight={handleUpdateDomainWeight}
      onConfirm={handleConfirm}
      onBack={() => setPhase(2)}
    />
  );
}
