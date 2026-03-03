import { getLanguage } from '@/lib/i18n';

/** Map app language codes to BCP 47 locale tags */
function getLocale(): string {
  const lang = getLanguage();
  switch (lang) {
    case 'de': return 'de-CH';
    case 'fr': return 'fr-CH';
    case 'en': return 'en-GB';
    default: return 'de-CH';
  }
}

/** "4 Mar 2026" */
export function formatDate(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  return d.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Wednesday, 4 March 2026" */
export function formatDateLong(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  return d.toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** "4 Mar 2026, 14:30" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(getLocale(), {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** "Wed" — short weekday */
export function formatWeekdayShort(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  return d.toLocaleDateString(getLocale(), { weekday: 'short' });
}

/** "Wednesday, 4 March" — long weekday + day + month, no year */
export function formatDateWeekday(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  return d.toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
}
