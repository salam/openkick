'use client';

import { useEffect, useRef, useState } from 'react';

interface AltchaWidgetProps {
  onVerify: (payload: string) => void;
  challengeUrl?: string;
}

export default function AltchaWidget({
  onVerify,
  challengeUrl,
}: AltchaWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;

  const [challengeJson, setChallengeJson] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    import('altcha');
  }, []);

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
    if (!challengeJson || !containerRef.current) return;

    const container = containerRef.current;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const widget = document.createElement('altcha-widget');
    widget.setAttribute('challengejson', challengeJson);
    widget.setAttribute('hidefooter', '');

    const handleVerify = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.payload) {
        onVerifyRef.current(detail.payload);
      }
    };

    const handleError = () => {
      setError(true);
    };

    widget.addEventListener('verified', handleVerify);
    widget.addEventListener('error', handleError);

    container.appendChild(widget);

    return () => {
      widget.removeEventListener('verified', handleVerify);
      widget.removeEventListener('error', handleError);
    };
  }, [challengeJson]);

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

  return <div ref={containerRef} />;
}
