'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { SettingsFormProps } from './ClubProfileForm';

interface LlmConfigFormProps extends SettingsFormProps {
  onSaveKeys: (keys: string[]) => Promise<void>;
}

interface ModelOption {
  id: string;
  label: string;
  pricing: string;
  tier: 'latest' | 'budget' | 'more';
}

export const LLM_PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Claude (Anthropic)' },
  { value: 'euria', label: 'Infomaniak Euria' },
];

export const MODEL_SUGGESTIONS: Record<string, ModelOption[]> = {
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o', pricing: '$2.50 / $10', tier: 'latest' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', pricing: '$0.15 / $0.60', tier: 'budget' },
    { id: 'gpt-5', label: 'GPT-5', pricing: '$1.25 / $10', tier: 'more' },
    { id: 'gpt-5-mini', label: 'GPT-5 Mini', pricing: '$0.30 / $1.10', tier: 'more' },
    { id: 'o3-mini', label: 'o3-mini', pricing: '$1.10 / $4.40', tier: 'more' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-6-20260220', label: 'Claude Sonnet 4.6', pricing: '$3 / $15', tier: 'latest' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', pricing: '$1 / $5', tier: 'budget' },
    { id: 'claude-opus-4-6-20260220', label: 'Claude Opus 4.6', pricing: '$15 / $75', tier: 'more' },
    { id: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet 4.5', pricing: '$3 / $15', tier: 'more' },
  ],
  euria: [
    { id: 'euria', label: 'Euria', pricing: 'Included', tier: 'latest' },
  ],
};

export const PROVIDER_DASHBOARD_LINKS: Record<string, { url: string; label: string }> = {
  openai: { url: 'https://platform.openai.com/api-keys', label: 'OpenAI Dashboard' },
  anthropic: { url: 'https://console.anthropic.com/settings/keys', label: 'Anthropic Console' },
  euria: { url: 'https://manager.infomaniak.com', label: 'Infomaniak Manager' },
};

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';
const btnSecondary =
  'rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50';

export default function LlmConfigForm({
  settings,
  onUpdate,
  onSaveKeys,
}: LlmConfigFormProps) {
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [showMoreModels, setShowMoreModels] = useState(false);
  const [useCustomModel, setUseCustomModel] = useState(false);

  async function handleTestConnection() {
    setTestingConnection(true);
    setTestResult(null);
    try {
      // Save LLM settings first
      await onSaveKeys(['llm_provider', 'llm_model', 'llm_api_key', 'llm_product_id']);
      const res = await apiFetch<{ success: boolean; message?: string }>(
        '/api/settings/test-llm',
        { method: 'POST' },
      );
      setTestResult({ ok: res.success, msg: res.message || 'Connection successful.' });
    } catch {
      setTestResult({ ok: false, msg: 'Connection test failed.' });
    } finally {
      setTestingConnection(false);
    }
  }

  return (
    <div className={cardClass}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        LLM Configuration
      </h2>
      <div className="space-y-4">
        <div>
          <label htmlFor="llm_provider" className={labelClass}>
            Provider
          </label>
          <select
            id="llm_provider"
            value={settings.llm_provider || ''}
            onChange={(e) => onUpdate('llm_provider', e.target.value)}
            className={inputClass}
          >
            <option value="">Select provider...</option>
            {LLM_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="llm_model" className={labelClass}>
            Model
          </label>
          {(() => {
            const provider = settings.llm_provider || '';
            const models = MODEL_SUGGESTIONS[provider] || [];
            const primaryModels = models.filter((m) => m.tier !== 'more');
            const moreModels = models.filter((m) => m.tier === 'more');
            const currentValue = settings.llm_model || '';
            const isKnownModel = models.some((m) => m.id === currentValue);

            if (!provider || useCustomModel) {
              return (
                <div className="space-y-1">
                  <input
                    id="llm_model"
                    type="text"
                    value={currentValue}
                    onChange={(e) => onUpdate('llm_model', e.target.value)}
                    placeholder="e.g. gpt-4o-mini, claude-sonnet-4-6-20260220"
                    className={inputClass}
                  />
                  {provider && (
                    <button
                      type="button"
                      onClick={() => setUseCustomModel(false)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      &larr; Back to suggested models
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div className="space-y-2">
                <div className="space-y-1">
                  {primaryModels.map((m) => (
                    <label
                      key={m.id}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                        currentValue === m.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="llm_model"
                          value={m.id}
                          checked={currentValue === m.id}
                          onChange={() => onUpdate('llm_model', m.id)}
                          className="text-blue-600"
                        />
                        <span className="text-sm font-medium text-gray-900">
                          {m.label}
                        </span>
                        {m.tier === 'latest' && (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 uppercase">
                            Latest
                          </span>
                        )}
                        {m.tier === 'budget' && (
                          <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 uppercase">
                            Budget
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {m.pricing} /M tokens
                      </span>
                    </label>
                  ))}
                </div>

                {moreModels.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowMoreModels(!showMoreModels)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      {showMoreModels ? '▾ Hide more models' : '▸ More models...'}
                    </button>
                    {showMoreModels && (
                      <div className="mt-1 space-y-1">
                        {moreModels.map((m) => (
                          <label
                            key={m.id}
                            className={`flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                              currentValue === m.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300 bg-white'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="llm_model"
                                value={m.id}
                                checked={currentValue === m.id}
                                onChange={() => onUpdate('llm_model', m.id)}
                                className="text-blue-600"
                              />
                              <span className="text-sm text-gray-700">
                                {m.label}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {m.pricing} /M tokens
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setUseCustomModel(true)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Enter custom model ID...
                </button>

                {!isKnownModel && currentValue && (
                  <p className="text-xs text-amber-600">
                    Custom model: {currentValue}
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        <div>
          <label htmlFor="llm_api_key" className={labelClass}>
            API Key
          </label>
          <input
            id="llm_api_key"
            type="password"
            value={settings.llm_api_key || ''}
            onChange={(e) => onUpdate('llm_api_key', e.target.value)}
            placeholder="Enter API key"
            className={inputClass}
          />
          {settings.llm_provider && PROVIDER_DASHBOARD_LINKS[settings.llm_provider] && (
            <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
              <p className="text-xs text-blue-800">
                Get your API key from the{' '}
                <a
                  href={PROVIDER_DASHBOARD_LINKS[settings.llm_provider].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline hover:text-blue-900"
                >
                  {PROVIDER_DASHBOARD_LINKS[settings.llm_provider].label} &rarr;
                </a>
              </p>
            </div>
          )}
        </div>

        {settings.llm_provider === 'euria' && (
          <div>
            <label htmlFor="llm_product_id" className={labelClass}>
              Product ID
            </label>
            <input
              id="llm_product_id"
              type="text"
              value={settings.llm_product_id || ''}
              onChange={(e) => onUpdate('llm_product_id', e.target.value)}
              placeholder="Infomaniak Product ID"
              className={inputClass}
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleTestConnection}
            disabled={testingConnection}
            className={btnSecondary}
          >
            {testingConnection ? 'Testing...' : 'Test Connection'}
          </button>
          {testResult && (
            <span
              className={`text-sm font-medium ${
                testResult.ok ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {testResult.msg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
