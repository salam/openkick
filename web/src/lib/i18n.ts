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
  },
};

export function detectLanguage(): string {
  if (typeof navigator === 'undefined') return 'de';
  const lang = navigator.language.split('-')[0];
  return ['de', 'fr', 'en'].includes(lang) ? lang : 'de';
}

export function t(key: string, lang?: string): string {
  const l = lang || detectLanguage();
  return translations[l]?.[key] || translations['de']?.[key] || key;
}
