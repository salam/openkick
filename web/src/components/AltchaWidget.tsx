'use client';

import { useEffect, useRef } from 'react';
import 'altcha';

interface AltchaWidgetProps {
  onVerify: (payload: string) => void;
  challengeUrl?: string;
}

export default function AltchaWidget({
  onVerify,
  challengeUrl,
}: AltchaWidgetProps) {
  const widgetRef = useRef<HTMLElement>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const url = challengeUrl || `${apiUrl}/api/captcha/challenge`;

  useEffect(() => {
    const el = widgetRef.current;
    if (!el) return;

    const handleVerify = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.payload) {
        onVerify(detail.payload);
      }
    };

    el.addEventListener('verification', handleVerify);
    return () => el.removeEventListener('verification', handleVerify);
  }, [onVerify]);

  return (
    <altcha-widget
      ref={widgetRef}
      challengeurl={url}
      hidefooter
    />
  );
}
