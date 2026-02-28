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
  const [challengeJson, setChallengeJson] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const url = challengeUrl || `${apiUrl}/api/captcha/challenge`;

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Challenge endpoint returned non-OK');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setChallengeJson(JSON.stringify(data));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

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
  }, [onVerify, challengeJson]);

  if (error) {
    return (
      <p className="mt-1 text-xs text-amber-600">
        Verification unavailable. Make sure the server is running.
      </p>
    );
  }

  if (!challengeJson) {
    return (
      <p className="mt-1 text-xs text-gray-400">
        Loading verification…
      </p>
    );
  }

  return (
    <altcha-widget
      ref={widgetRef}
      challengejson={challengeJson}
      hidefooter
    />
  );
}
