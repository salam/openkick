'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { t, getLanguage } from '@/lib/i18n';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface WahaWizardProps {
  authToken: string;
  onComplete: () => void;
  onSkip: () => void;
}

const STEP_KEYS = ['docker', 'configure', 'install', 'connect'] as const;

/* ------------------------------------------------------------------ */
/*  Step indicator                                                     */
/* ------------------------------------------------------------------ */

function StepIndicator({ current, completed }: { current: number; completed: number[] }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {STEP_KEYS.map((key, i) => {
        const step = i + 1;
        const isDone = completed.includes(step);
        const isCurrent = step === current;
        return (
          <div key={step} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-px w-6 ${isDone || isCurrent ? 'bg-primary-400' : 'bg-gray-300'}`}
              />
            )}
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                  isDone
                    ? 'bg-primary-500 text-white'
                    : isCurrent
                      ? 'border-2 border-primary-500 text-primary-600'
                      : 'border-2 border-gray-300 text-gray-400'
                }`}
              >
                {isDone ? '✓' : step}
              </div>
              <span
                className={`mt-1 text-[10px] ${isCurrent ? 'font-medium text-primary-600' : 'text-gray-400'}`}
              >
                {t(key)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SSE log viewer helper                                              */
/* ------------------------------------------------------------------ */

function useSSE(authToken: string) {
  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setLogs([]);
    setRunning(false);
    setDone(false);
    setError('');
  }, []);

  const start = useCallback(
    async (url: string, body?: Record<string, unknown>) => {
      reset();
      setRunning(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        for (;;) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const payload = line.slice(6);
              try {
                const parsed = JSON.parse(payload);
                if (parsed.type === 'error') {
                  setError(parsed.text || parsed.error || 'Unknown error');
                } else if (parsed.type === 'done') {
                  // will be handled after loop
                } else if (parsed.text || parsed.line) {
                  setLogs((prev) => [...prev, parsed.text || parsed.line]);
                }
              } catch {
                setLogs((prev) => [...prev, payload]);
              }
            }
          }
        }

        setDone(true);
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message || 'Unknown error');
        }
      } finally {
        setRunning(false);
      }
    },
    [authToken, reset],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { logs, running, done, error, start, cancel, reset };
}

function LogViewer({ logs }: { logs: string[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (logs.length === 0) return null;
  return (
    <div className="mt-4 max-h-48 overflow-y-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400">
      {logs.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Steps                                                              */
/* ------------------------------------------------------------------ */

function StepDocker({
  authToken,
  onNext,
  onSkip,
  onNativeDetected,
}: {
  authToken: string;
  onNext: () => void;
  onSkip: () => void;
  onNativeDetected: () => void;
}) {
  const [status, setStatus] = useState<'checking' | 'available' | 'missing' | 'native'>('checking');
  const sse = useSSE(authToken);

  const checkDocker = useCallback(async () => {
    setStatus('checking');
    try {
      const res = await fetch(`${API_URL}/api/setup-waha/docker/status`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (data.available) {
        setStatus('available');
        onNext();
        return;
      }
    } catch {
      // Docker not available — fall through to native check
    }

    // Docker not available — check if WAHA is reachable natively
    try {
      const res = await fetch(`${API_URL}/api/setup-waha/waha/reachable`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (data.reachable) {
        setStatus('native');
        onNativeDetected();
        return;
      }
    } catch {
      // Native check also failed
    }

    setStatus('missing');
  }, [authToken, onNext, onNativeDetected]);

  useEffect(() => {
    checkDocker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (sse.done && !sse.error) {
      checkDocker();
    }
  }, [sse.done, sse.error, checkDocker]);

  return (
    <div>
      <h3 className="mb-2 text-lg font-semibold text-gray-800">{t('docker_check')}</h3>

      {status === 'checking' && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          {t('checking_docker')}
        </div>
      )}

      {status === 'native' && (
        <div className="mb-4 rounded-lg bg-primary-50 px-4 py-3 text-sm text-primary-700">
          <p className="font-medium">{t('waha_native_detected')}</p>
          <p className="mt-1 text-xs text-primary-600">{t('waha_native_hint')}</p>
        </div>
      )}

      {status === 'missing' && !sse.running && (
        <>
          <p className="mb-4 text-sm text-gray-600">
            {t('waha_neither_available')}
          </p>
          <p className="mb-4 text-xs text-gray-400">
            {t('docker_shared_hosting_hint')}
          </p>
          {sse.error && (
            <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {sse.error}
            </div>
          )}
          <button
            onClick={() => sse.start(`${API_URL}/api/setup-waha/docker/install`)}
            className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 disabled:opacity-50"
          >
            {t('install_docker')}
          </button>
        </>
      )}

      {sse.running && (
        <p className="text-sm text-gray-500">{t('installing_docker')}</p>
      )}

      <LogViewer logs={sse.logs} />

      <button
        onClick={onSkip}
        className="mt-6 block text-xs text-gray-400 underline hover:text-gray-600"
      >
        {t('skip_for_now')}
      </button>
    </div>
  );
}

function StepConfigure({
  onNext,
  onSkip,
  port,
  setPort,
  engine,
  setEngine,
}: {
  onNext: () => void;
  onSkip: () => void;
  port: number;
  setPort: (p: number) => void;
  engine: string;
  setEngine: (e: string) => void;
}) {
  const [portError, setPortError] = useState('');

  function handleNext() {
    if (port < 1024 || port > 65535) {
      setPortError(t('port_error'));
      return;
    }
    setPortError('');
    onNext();
  }

  return (
    <div>
      <h3 className="mb-2 text-lg font-semibold text-gray-800">{t('configure_waha')}</h3>
      <p className="mb-6 text-sm text-gray-600">
        {t('waha_config_hint')}
      </p>

      <label className="mb-1 block text-sm font-medium text-gray-700">{t('port')}</label>
      <input
        type="number"
        min={1024}
        max={65535}
        value={port}
        onChange={(e) => setPort(Number(e.target.value))}
        className="mb-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      {portError && <p className="mb-3 text-xs text-red-600">{portError}</p>}
      <p className="mb-4 text-xs text-gray-400">{t('port_hint')}</p>

      <label className="mb-1 block text-sm font-medium text-gray-700">{t('engine')}</label>
      <select
        value={engine}
        onChange={(e) => setEngine(e.target.value)}
        className="mb-6 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      >
        <option value="WEBJS">{t('webjs_recommended')}</option>
        <option value="NOWEB">{t('noweb_experimental')}</option>
      </select>

      <button
        onClick={handleNext}
        className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600"
      >
        {t('next')}
      </button>

      <button
        onClick={onSkip}
        className="mt-6 block text-xs text-gray-400 underline hover:text-gray-600"
      >
        {t('skip_for_now')}
      </button>
    </div>
  );
}

function StepInstall({
  authToken,
  port,
  engine,
  onNext,
  onSkip,
}: {
  authToken: string;
  port: number;
  engine: string;
  onNext: () => void;
  onSkip: () => void;
}) {
  const sse = useSSE(authToken);

  useEffect(() => {
    if (sse.done && !sse.error) {
      onNext();
    }
  }, [sse.done, sse.error, onNext]);

  return (
    <div>
      <h3 className="mb-2 text-lg font-semibold text-gray-800">{t('install_waha')}</h3>
      <p className="mb-4 text-sm text-gray-600">
        {t('install_waha_desc')}
      </p>

      {sse.error && (
        <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {sse.error}
        </div>
      )}

      {!sse.running && !sse.done && (
        <button
          onClick={() =>
            sse.start(`${API_URL}/api/setup-waha/waha/install`, { port, engine })
          }
          className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600"
        >
          {sse.error ? t('retry_install') : t('install_waha_btn')}
        </button>
      )}

      {sse.running && (
        <p className="text-sm text-gray-500">{t('installing_waha')}</p>
      )}

      <LogViewer logs={sse.logs} />

      <button
        onClick={onSkip}
        className="mt-6 block text-xs text-gray-400 underline hover:text-gray-600"
      >
        {t('skip_for_now')}
      </button>
    </div>
  );
}

function StepConnect({
  authToken,
  onComplete,
  onSkip,
}: {
  authToken: string;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessionInfo, setSessionInfo] = useState('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchQr = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/setup-waha/waha/qr`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      setQrUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch {
      // QR not ready yet
    }
  }, [authToken]);

  const pollSession = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/setup-waha/waha/session`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();

      if (data.status && data.status !== 'SCAN_QR_CODE' && data.status !== 'WORKING' && data.status !== 'STARTING') {
        // Connected or authenticated
        if (data.me) {
          setSessionInfo(data.me.pushName || data.me.id || 'Connected');
        }
        setConnected(true);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } else if (data.status === 'SCAN_QR_CODE') {
        // Refresh QR
        fetchQr();
      }
    } catch {
      // not ready
    }
  }, [authToken, fetchQr]);

  useEffect(() => {
    fetchQr();
    pollingRef.current = setInterval(pollSession, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchQr, pollSession]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (qrUrl) URL.revokeObjectURL(qrUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (connected) {
    return (
      <div>
        <h3 className="mb-2 text-lg font-semibold text-gray-800">{t('whatsapp_connected')}</h3>
        <div className="mb-4 rounded-lg bg-primary-50 px-4 py-3 text-sm text-primary-700">
          {t('connected_as')}{sessionInfo ? ` ${sessionInfo}` : ''}!
        </div>
        <button
          onClick={onComplete}
          className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600"
        >
          {t('continue_dashboard')}
        </button>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-2 text-lg font-semibold text-gray-800">{t('connect_whatsapp')}</h3>
      <p className="mb-4 text-sm text-gray-600">
        {t('scan_qr_hint')}
      </p>

      <div className="flex justify-center">
        {qrUrl ? (
          <img
            src={qrUrl}
            alt="WhatsApp QR Code"
            className="h-56 w-56 rounded-lg border border-gray-200"
          />
        ) : (
          <div className="flex h-56 w-56 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-gray-400">
        {t('qr_waiting')}
      </p>

      <button
        onClick={onSkip}
        className="mt-6 block text-xs text-gray-400 underline hover:text-gray-600"
      >
        {t('skip_for_now')}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main wizard                                                        */
/* ------------------------------------------------------------------ */

export default function WahaWizard({ authToken, onComplete, onSkip }: WahaWizardProps) {
  const [step, setStep] = useState(1);
  const [completed, setCompleted] = useState<number[]>([]);
  const [port, setPort] = useState(3008);
  const [engine, setEngine] = useState('WEBJS');
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener('languagechange', onLangChange);
    return () => window.removeEventListener('languagechange', onLangChange);
  }, []);

  const markComplete = useCallback((s: number) => {
    setCompleted((prev) => (prev.includes(s) ? prev : [...prev, s]));
  }, []);

  const advance = useCallback(
    (from: number) => {
      markComplete(from);
      setStep(from + 1);
    },
    [markComplete],
  );

  // When WAHA is running natively (no Docker), skip steps 1-3 and go to QR
  const handleNativeDetected = useCallback(() => {
    markComplete(1);
    markComplete(2);
    markComplete(3);
    setStep(4);
  }, [markComplete]);

  return (
    <div className="w-full max-w-md">
      {/* Branding */}
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-primary-600">OpenKick</h1>
        <p className="mt-1 text-sm text-gray-500">{t('whatsapp_setup')}</p>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-md">
        <StepIndicator current={step} completed={completed} />

        {step === 1 && (
          <StepDocker
            authToken={authToken}
            onNext={() => advance(1)}
            onSkip={onSkip}
            onNativeDetected={handleNativeDetected}
          />
        )}
        {step === 2 && (
          <StepConfigure
            port={port}
            setPort={setPort}
            engine={engine}
            setEngine={setEngine}
            onNext={() => advance(2)}
            onSkip={onSkip}
          />
        )}
        {step === 3 && (
          <StepInstall
            authToken={authToken}
            port={port}
            engine={engine}
            onNext={() => advance(3)}
            onSkip={onSkip}
          />
        )}
        {step === 4 && (
          <StepConnect
            authToken={authToken}
            onComplete={() => {
              markComplete(4);
              onComplete();
            }}
            onSkip={onSkip}
          />
        )}
      </div>
    </div>
  );
}
