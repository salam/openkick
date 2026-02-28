'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [error, setError] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const url = challengeUrl || `${apiUrl}/api/captcha/challenge`;

  useEffect(() => {
    const el = widgetRef.current;
    if (!el) return;

    const handleVerify = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.payload) {
        setError(false);
        onVerify(detail.payload);
      }
    };

    const handleError = () => {
      setError(true);
    };

    el.addEventListener('verification', handleVerify);
    el.addEventListener('error', handleError);
    return () => {
      el.removeEventListener('verification', handleVerify);
      el.removeEventListener('error', handleError);
    };
  }, [onVerify]);

  return (
    <div>
      <altcha-widget
        ref={widgetRef}
        challengeurl={url}
        hidefooter
      />
      {error && (
        <p className="mt-1 text-xs text-amber-600">
          Verification unavailable. Make sure the server is running.
        </p>
      )}
    </div>
  );
}
