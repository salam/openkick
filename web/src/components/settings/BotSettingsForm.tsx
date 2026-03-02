'use client';

import { useState, useMemo } from 'react';
import { apiFetch } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { SettingsFormProps } from './ClubProfileForm';

interface BotSettingsFormProps extends SettingsFormProps {
  onSaveKeys: (keys: string[]) => Promise<void>;
}

interface TemplateDefinition {
  key: string;
  variables?: string[];
}

interface TemplateCategory {
  labelKey: string;
  templates: TemplateDefinition[];
}

const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    labelKey: 'bot_templates_general',
    templates: [
      { key: 'whatsapp_help' },
      { key: 'whatsapp_welcome', variables: ['teamName'] },
    ],
  },
  {
    labelKey: 'bot_templates_confirmations',
    templates: [
      { key: 'whatsapp_confirm_attending', variables: ['playerName', 'eventTitle', 'eventDate'] },
      { key: 'whatsapp_confirm_absent', variables: ['playerName', 'eventTitle', 'eventDate'] },
      { key: 'whatsapp_confirm_waitlist', variables: ['playerName', 'eventTitle', 'eventDate'] },
      { key: 'whatsapp_disambiguate', variables: ['options'] },
    ],
  },
  {
    labelKey: 'bot_templates_onboarding',
    templates: [
      { key: 'whatsapp_onboarding_ask_name' },
      { key: 'whatsapp_onboarding_ask_child' },
      { key: 'whatsapp_onboarding_ask_birthyear', variables: ['childName'] },
      { key: 'whatsapp_onboarding_ask_consent' },
      { key: 'whatsapp_onboarding_no_match' },
      { key: 'whatsapp_onboarding_birthyear_mismatch' },
      { key: 'whatsapp_onboarding_consent_declined' },
      { key: 'whatsapp_onboarding_complete', variables: ['childName'] },
    ],
  },
  {
    labelKey: 'bot_templates_reminders',
    templates: [
      { key: 'whatsapp_reminder_with_link', variables: ['eventTitle', 'eventDate', 'url'] },
    ],
  },
  {
    labelKey: 'bot_templates_coach',
    templates: [
      { key: 'whatsapp_coach_attendance_overview', variables: ['eventTitle', 'eventDate', 'attending', 'absent', 'pending'] },
      { key: 'whatsapp_coach_event_cancelled', variables: ['eventTitle', 'eventDate'] },
      { key: 'whatsapp_coach_cancellation_notice', variables: ['eventTitle', 'eventDate'] },
      { key: 'whatsapp_coach_reminder_sent', variables: ['count', 'eventTitle'] },
      { key: 'whatsapp_coach_mark_confirmed', variables: ['playerName', 'eventTitle', 'status'] },
      { key: 'whatsapp_coach_help' },
      { key: 'whatsapp_coach_admin_link', variables: ['url'] },
      { key: 'whatsapp_coach_no_event' },
      { key: 'whatsapp_coach_player_not_found', variables: ['name'] },
    ],
  },
];

const DEFAULT_TEMPLATES: Record<string, Record<string, string>> = {
  de: {
    whatsapp_help: "Sende den Namen deines Kindes mit 'kommt' oder 'kommt nicht', z.B. 'Luca kommt' oder 'Luca ist krank'.",
    whatsapp_welcome: 'Willkommen bei {{teamName}}!',
    whatsapp_confirm_attending: '{{playerName}} ist fuer {{eventTitle}} am {{eventDate}} angemeldet.',
    whatsapp_confirm_absent: '{{playerName}} ist fuer {{eventTitle}} am {{eventDate}} abgemeldet.',
    whatsapp_confirm_waitlist: '{{playerName}} steht auf der Warteliste fuer {{eventTitle}} am {{eventDate}}.',
    whatsapp_disambiguate: 'Fuer welches Kind?\n{{options}}',
    whatsapp_onboarding_ask_name: 'Wie heisst du?',
    whatsapp_onboarding_ask_child: 'Wie heisst dein Kind, das im Team spielt?',
    whatsapp_onboarding_ask_birthyear: 'In welchem Jahr ist {{childName}} geboren?',
    whatsapp_onboarding_ask_consent: 'Duerfen wir deine Kontaktdaten speichern, um dich ueber Trainings und Spiele zu informieren? (Ja/Nein)',
    whatsapp_onboarding_no_match: 'Wir konnten kein Kind mit diesem Namen finden. Bitte kontaktiere den Trainer direkt.',
    whatsapp_onboarding_birthyear_mismatch: 'Das Geburtsjahr stimmt nicht ueberein. Bitte versuche es nochmal.',
    whatsapp_onboarding_consent_declined: 'Okay, wir speichern keine Daten. Du kannst dich jederzeit melden, wenn du es dir anders ueberlegst.',
    whatsapp_onboarding_complete: 'Alles klar! Du bist jetzt registriert als Elternteil von {{childName}}. Du kannst nun per Nachricht Ab- oder Zusagen senden.',
    whatsapp_reminder_with_link: 'Erinnerung: {{eventTitle}} am {{eventDate}}. Bitte gib Bescheid!\n\nOnline antworten: {{url}}',
    whatsapp_coach_attendance_overview: '📋 {{eventTitle}} am {{eventDate}}\n✅ {{attending}}\n❌ {{absent}}\n❓ {{pending}}',
    whatsapp_coach_event_cancelled: '{{eventTitle}} am {{eventDate}} wurde abgesagt. Alle Eltern wurden benachrichtigt.',
    whatsapp_coach_cancellation_notice: '{{eventTitle}} am {{eventDate}} wurde abgesagt.',
    whatsapp_coach_reminder_sent: '{{count}} Erinnerungen fuer {{eventTitle}} gesendet.',
    whatsapp_coach_mark_confirmed: '{{playerName}} ist fuer {{eventTitle}} als {{status}} markiert.',
    whatsapp_coach_help: "Verfuegbare Befehle:\n- Wer kommt?\n- Aufstellung?\n- Training absagen\n- Erinnerung senden\n- [Name] anwesend/abwesend",
    whatsapp_coach_admin_link: 'Diese Funktion ist im Webportal verfuegbar: {{url}}',
    whatsapp_coach_no_event: 'Kein bevorstehendes Event gefunden.',
    whatsapp_coach_player_not_found: "Spieler '{{name}}' nicht gefunden.",
  },
  en: {
    whatsapp_help: "Send your child's name with 'attending' or 'absent', e.g. 'Luca is coming' or 'Luca is sick'.",
    whatsapp_welcome: 'Welcome to {{teamName}}!',
    whatsapp_confirm_attending: '{{playerName}} is confirmed for {{eventTitle}} on {{eventDate}}.',
    whatsapp_confirm_absent: '{{playerName}} is absent for {{eventTitle}} on {{eventDate}}.',
    whatsapp_confirm_waitlist: '{{playerName}} is on the waitlist for {{eventTitle}} on {{eventDate}}.',
    whatsapp_disambiguate: 'Which child?\n{{options}}',
    whatsapp_onboarding_ask_name: "What's your name?",
    whatsapp_onboarding_ask_child: "What's the name of your child who plays on the team?",
    whatsapp_onboarding_ask_birthyear: 'What year was {{childName}} born?',
    whatsapp_onboarding_ask_consent: 'May we store your contact details to inform you about trainings and matches? (Yes/No)',
    whatsapp_onboarding_no_match: "We couldn't find a child with that name. Please contact the coach directly.",
    whatsapp_onboarding_birthyear_mismatch: "The birth year doesn't match. Please try again.",
    whatsapp_onboarding_consent_declined: "Okay, we won't store any data. Feel free to reach out if you change your mind.",
    whatsapp_onboarding_complete: "All set! You're now registered as a parent of {{childName}}. You can send attendance messages anytime.",
    whatsapp_reminder_with_link: 'Reminder: {{eventTitle}} on {{eventDate}}. Please respond!\n\nRespond online: {{url}}',
    whatsapp_coach_attendance_overview: '📋 {{eventTitle}} on {{eventDate}}\n✅ {{attending}}\n❌ {{absent}}\n❓ {{pending}}',
    whatsapp_coach_event_cancelled: '{{eventTitle}} on {{eventDate}} has been cancelled. All parents have been notified.',
    whatsapp_coach_cancellation_notice: '{{eventTitle}} on {{eventDate}} has been cancelled.',
    whatsapp_coach_reminder_sent: '{{count}} reminders sent for {{eventTitle}}.',
    whatsapp_coach_mark_confirmed: '{{playerName}} is marked as {{status}} for {{eventTitle}}.',
    whatsapp_coach_help: "Available commands:\n- Who's coming?\n- Match sheet?\n- Cancel training\n- Send reminder\n- [Name] attending/absent",
    whatsapp_coach_admin_link: 'This feature is available in the web portal: {{url}}',
    whatsapp_coach_no_event: 'No upcoming event found.',
    whatsapp_coach_player_not_found: "Player '{{name}}' not found.",
  },
  fr: {
    whatsapp_help: "Envoie le nom de ton enfant avec 'present' ou 'absent', par ex. 'Luca est la' ou 'Luca est malade'.",
    whatsapp_welcome: 'Bienvenue chez {{teamName}} !',
    whatsapp_confirm_attending: '{{playerName}} est inscrit(e) pour {{eventTitle}} le {{eventDate}}.',
    whatsapp_confirm_absent: '{{playerName}} est desinscrit(e) pour {{eventTitle}} le {{eventDate}}.',
    whatsapp_confirm_waitlist: "{{playerName}} est sur la liste d'attente pour {{eventTitle}} le {{eventDate}}.",
    whatsapp_disambiguate: 'Pour quel enfant ?\n{{options}}',
    whatsapp_onboarding_ask_name: "Comment tu t'appelles ?",
    whatsapp_onboarding_ask_child: "Comment s'appelle ton enfant qui joue dans l'equipe ?",
    whatsapp_onboarding_ask_birthyear: 'En quelle annee est ne(e) {{childName}} ?',
    whatsapp_onboarding_ask_consent: "Pouvons-nous enregistrer tes coordonnees pour t'informer des entrainements et des matchs ? (Oui/Non)",
    whatsapp_onboarding_no_match: "Nous n'avons pas trouve d'enfant avec ce nom. Contacte directement l'entraineur.",
    whatsapp_onboarding_birthyear_mismatch: "L'annee de naissance ne correspond pas. Reessaie.",
    whatsapp_onboarding_consent_declined: "D'accord, nous ne conserverons aucune donnee. N'hesite pas a revenir si tu changes d'avis.",
    whatsapp_onboarding_complete: "C'est tout bon ! Tu es maintenant inscrit(e) comme parent de {{childName}}. Tu peux envoyer des messages de presence a tout moment.",
    whatsapp_reminder_with_link: 'Rappel : {{eventTitle}} le {{eventDate}}. Merci de repondre !\n\nRepondre en ligne : {{url}}',
    whatsapp_coach_attendance_overview: '📋 {{eventTitle}} le {{eventDate}}\n✅ {{attending}}\n❌ {{absent}}\n❓ {{pending}}',
    whatsapp_coach_event_cancelled: '{{eventTitle}} le {{eventDate}} a ete annule. Tous les parents ont ete informes.',
    whatsapp_coach_cancellation_notice: '{{eventTitle}} le {{eventDate}} a ete annule.',
    whatsapp_coach_reminder_sent: '{{count}} rappels envoyes pour {{eventTitle}}.',
    whatsapp_coach_mark_confirmed: '{{playerName}} est marque(e) comme {{status}} pour {{eventTitle}}.',
    whatsapp_coach_help: "Commandes disponibles :\n- Qui vient ?\n- Composition ?\n- Annuler l'entrainement\n- Envoyer un rappel\n- [Nom] present/absent",
    whatsapp_coach_admin_link: 'Cette fonction est disponible dans le portail web : {{url}}',
    whatsapp_coach_no_event: 'Aucun evenement a venir.',
    whatsapp_coach_player_not_found: "Joueur '{{name}}' non trouve.",
  },
};

const SAMPLE_DATA: Record<string, string> = {
  playerName: 'Luca',
  eventTitle: 'Training',
  eventDate: 'Mo 3. Mrz 18:00',
  childName: 'Luca',
  teamName: '', // filled from settings
  url: 'https://example.com/rsvp/123',
  options: '1) Luca\n2) Emma',
  attending: 'Luca, Emma, Noah (3)',
  absent: 'Mia (1)',
  pending: 'Leon, Sofia (2)',
  count: '5',
  status: 'anwesend',
  name: 'Max',
};

function fillPreview(template: string, sampleData: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return sampleData[varName] ?? match;
  });
}

const cardClass = 'rounded-lg border border-gray-200 bg-white p-6';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';
const btnSecondary =
  'rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50';

export default function BotSettingsForm({
  settings,
  onUpdate,
  onSaveKeys,
}: BotSettingsFormProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ key: string; ok: boolean; msg: string } | null>(null);

  const botLang = settings.bot_language || 'de';
  const defaults = DEFAULT_TEMPLATES[botLang] || DEFAULT_TEMPLATES.de;

  const sampleData = useMemo(() => ({
    ...SAMPLE_DATA,
    teamName: settings.club_name || 'FC Musterstadt',
  }), [settings.club_name]);

  const onboardingEnabled = settings.bot_allow_onboarding !== 'false';

  async function handleToggleOnboarding() {
    const newValue = onboardingEnabled ? 'false' : 'true';
    onUpdate('bot_allow_onboarding', newValue);
    try {
      await apiFetch('/api/settings/bot_allow_onboarding', {
        method: 'PUT',
        body: JSON.stringify({ value: newValue }),
      });
    } catch {
      // revert on failure
      onUpdate('bot_allow_onboarding', onboardingEnabled ? 'true' : 'false');
    }
  }

  async function handleSaveTemplate(key: string) {
    const settingKey = `bot_template_${key}`;
    const customValue = settings[settingKey] || '';
    const defaultValue = defaults[key] || '';
    const valueToSave = customValue || defaultValue;
    setSavingTemplate(key);
    setSaveMsg(null);
    try {
      await apiFetch(`/api/settings/${settingKey}`, {
        method: 'PUT',
        body: JSON.stringify({ value: valueToSave }),
      });
      if (!customValue && defaultValue) {
        onUpdate(settingKey, defaultValue);
      }
      setSaveMsg({ key, ok: true, msg: t('settings_saved') });
    } catch {
      setSaveMsg({ key, ok: false, msg: t('failed_save_settings') });
    } finally {
      setSavingTemplate(null);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  async function handleResetTemplate(key: string) {
    const settingKey = `bot_template_${key}`;
    onUpdate(settingKey, '');
    try {
      await apiFetch(`/api/settings/${settingKey}`, {
        method: 'PUT',
        body: JSON.stringify({ value: '' }),
      });
      setSaveMsg({ key, ok: true, msg: t('settings_saved') });
    } catch {
      setSaveMsg({ key, ok: false, msg: t('failed_save_settings') });
    }
    setTimeout(() => setSaveMsg(null), 3000);
  }

  function toggleCategory(labelKey: string) {
    setExpandedCategory((prev) => (prev === labelKey ? null : labelKey));
  }

  return (
    <div className={cardClass}>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">
        {t('bot_settings')}
      </h2>
      <p className="mb-4 text-sm text-gray-500">
        {t('bot_settings_desc')}
      </p>

      {/* Toggle: bot_allow_onboarding */}
      <div className="mb-6">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-sm font-medium text-gray-700">
              {t('bot_allow_onboarding')}
            </span>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('bot_allow_onboarding_desc')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={onboardingEnabled}
            onClick={handleToggleOnboarding}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              onboardingEnabled ? 'bg-emerald-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                onboardingEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </label>
      </div>

      {/* Template categories */}
      <div className="space-y-3">
        {TEMPLATE_CATEGORIES.map((category) => {
          const isExpanded = expandedCategory === category.labelKey;
          return (
            <div key={category.labelKey} className="rounded-lg border border-gray-200">
              <button
                type="button"
                onClick={() => toggleCategory(category.labelKey)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors rounded-lg"
              >
                <span>{t(category.labelKey)}</span>
                <span className="text-xs text-gray-400">
                  {isExpanded ? '▾' : '▸'} {category.templates.length}
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-200 px-4 py-4 space-y-6">
                  {category.templates.map((tmpl) => {
                    const settingKey = `bot_template_${tmpl.key}`;
                    const customValue = settings[settingKey] || '';
                    const defaultValue = defaults[tmpl.key] || '';
                    const displayValue = customValue || defaultValue;
                    const isCustomized = !!customValue && customValue !== defaultValue;
                    const previewText = fillPreview(displayValue, sampleData);

                    return (
                      <div key={tmpl.key} className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <label
                              htmlFor={settingKey}
                              className={labelClass}
                            >
                              {t(`bot_template_${tmpl.key}`)}
                            </label>
                            <p className="text-xs text-gray-500">
                              {t(`bot_template_${tmpl.key}_desc`)}
                            </p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            {isCustomized && (
                              <button
                                type="button"
                                onClick={() => handleResetTemplate(tmpl.key)}
                                className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                                title={t('bot_template_reset')}
                              >
                                {t('bot_template_reset')}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleSaveTemplate(tmpl.key)}
                              disabled={savingTemplate === tmpl.key}
                              className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                            >
                              {savingTemplate === tmpl.key ? t('saving') : t('save_settings')}
                            </button>
                          </div>
                        </div>

                        <textarea
                          id={settingKey}
                          value={displayValue}
                          onChange={(e) => onUpdate(settingKey, e.target.value)}
                          rows={3}
                          className={inputClass + ' resize-y font-mono text-xs'}
                        />

                        {/* Variable hints */}
                        {tmpl.variables && tmpl.variables.length > 0 && (
                          <p className="text-xs text-gray-400">
                            {t('bot_template_variables')}:{' '}
                            {tmpl.variables.map((v) => `{{${v}}}`).join(', ')}
                          </p>
                        )}

                        {/* Live preview */}
                        {displayValue && (
                          <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                              {t('bot_template_preview')}
                            </p>
                            <p className="whitespace-pre-wrap text-sm text-gray-700">
                              {previewText}
                            </p>
                          </div>
                        )}

                        {/* Save feedback */}
                        {saveMsg && saveMsg.key === tmpl.key && (
                          <p
                            className={`text-xs font-medium ${
                              saveMsg.ok ? 'text-emerald-600' : 'text-red-600'
                            }`}
                          >
                            {saveMsg.msg}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
