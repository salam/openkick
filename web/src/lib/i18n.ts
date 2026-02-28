const translations: Record<string, Record<string, string>> = {
  de: {
    dashboard: 'Dashboard',
    events: 'Veranstaltungen',
    players: 'Spieler',
    attendance: 'Anwesenheit',
    calendar: 'Kalender',
    settings: 'Einstellungen',
    login: 'Anmelden',
    login_error: 'Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.',
    forgot_password: 'Passwort vergessen?',
    forgot_password_sent: 'Falls ein Konto mit dieser E-Mail existiert, wurde ein Link gesendet.',
    reset_password: 'Neues Passwort setzen',
    reset_password_submit: 'Passwort zurücksetzen',
    logout: 'Abmelden',
    password: 'Passwort',
    save: 'Speichern',
    cancel: 'Abbrechen',
    delete: 'Loeschen',
    edit: 'Bearbeiten',
    create: 'Erstellen',
    search: 'Suchen',
    team: 'Mannschaft',
    teams: 'Mannschaften',
    profile: 'Profil',
    home: 'Startseite',
    setup_title: 'Willkommen bei OpenKick',
    setup_subtitle: 'Erstelle dein Admin-Konto',
    setup_name: 'Name',
    setup_password_confirm: 'Passwort bestätigen',
    setup_submit: 'Konto erstellen',
    smtp_settings: 'E-Mail (SMTP)',
    smtp_test: 'Test-E-Mail senden',
  },
  en: {
    dashboard: 'Dashboard',
    events: 'Events',
    players: 'Players',
    attendance: 'Attendance',
    calendar: 'Calendar',
    settings: 'Settings',
    login: 'Login',
    login_error: 'Login failed. Please try again.',
    forgot_password: 'Forgot password?',
    forgot_password_sent: 'If an account with that email exists, a reset link has been sent.',
    reset_password: 'Set new password',
    reset_password_submit: 'Reset Password',
    logout: 'Logout',
    password: 'Password',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    search: 'Search',
    team: 'Team',
    teams: 'Teams',
    profile: 'Profile',
    home: 'Home',
    setup_title: 'Welcome to OpenKick',
    setup_subtitle: 'Create your admin account',
    setup_name: 'Name',
    setup_password_confirm: 'Confirm password',
    setup_submit: 'Create Account',
    smtp_settings: 'Email (SMTP)',
    smtp_test: 'Send Test Email',
  },
  fr: {
    dashboard: 'Tableau de bord',
    events: 'Evenements',
    players: 'Joueurs',
    attendance: 'Presence',
    calendar: 'Calendrier',
    settings: 'Parametres',
    login: 'Connexion',
    login_error: 'Echec de la connexion. Veuillez reessayer.',
    forgot_password: 'Mot de passe oublie?',
    forgot_password_sent: 'Si un compte avec cet email existe, un lien a ete envoye.',
    reset_password: 'Definir un nouveau mot de passe',
    reset_password_submit: 'Reinitialiser le mot de passe',
    logout: 'Deconnexion',
    password: 'Mot de passe',
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Supprimer',
    edit: 'Modifier',
    create: 'Creer',
    search: 'Rechercher',
    team: 'Equipe',
    teams: 'Equipes',
    profile: 'Profil',
    home: 'Accueil',
    setup_title: 'Bienvenue sur OpenKick',
    setup_subtitle: 'Creez votre compte administrateur',
    setup_name: 'Nom',
    setup_password_confirm: 'Confirmer le mot de passe',
    setup_submit: 'Creer le compte',
    smtp_settings: 'Email (SMTP)',
    smtp_test: 'Envoyer un email de test',
  },
};

export const SUPPORTED_LANGUAGES = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
] as const;

const STORAGE_KEY = 'openkick_lang';

export function detectLanguage(): string {
  if (typeof navigator === 'undefined') return 'de';
  const lang = navigator.language.split('-')[0];
  return ['de', 'fr', 'en'].includes(lang) ? lang : 'de';
}

export function getLanguage(): string {
  if (typeof window === 'undefined') return detectLanguage();
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED_LANGUAGES.some((l) => l.code === stored)) {
    return stored;
  }
  return detectLanguage();
}

export function setLanguage(lang: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, lang);
  window.dispatchEvent(new CustomEvent('languagechange', { detail: { lang } }));
}

export function t(key: string, lang?: string): string {
  const l = lang || getLanguage();
  return translations[l]?.[key] || translations['de']?.[key] || key;
}
