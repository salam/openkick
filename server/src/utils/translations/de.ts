const de: Record<string, string> = {
  welcome: "Willkommen bei OpenKick!",
  attendance_confirmed: "{{name}} ist als anwesend markiert.",
  attendance_absent: "{{name}} ist als abwesend markiert.",
  reminder: "Erinnerung: Bitte melde dich für {{event}} an.",
  event_created: "Neues Event erstellt: {{title}}",
  deadline_approaching:
    "Anmeldefrist für {{event}} endet am {{date}}.",
  waitlist_added:
    "{{name}} steht auf der Warteliste für {{event}}.",
  waitlist_promoted:
    "{{name}} hat einen Platz für {{event}} erhalten!",
  training_headsup:
    "Training morgen um {{time}} Uhr, {{location}}. Wetter: {{weather}}.",
  rain_alert: "Achtung: Training fällt wegen Regen aus!",
  cancellation: "Training am {{date}} ist abgesagt.",
  holiday_announcement:
    "Schulferien: {{name}} vom {{start}} bis {{end}}. Kein Training.",
  onboarding_ask_name: "Bitte sende den Namen deines Kindes.",
  consent_notice:
    "Wir speichern nur den Namen und die Telefonnummer.",
  whatsapp_welcome: "Willkommen bei {{teamName}}!",
  whatsapp_onboarding_ask_name: "Wie heisst du?",
  whatsapp_onboarding_ask_child:
    "Wie heisst dein Kind, das im Team spielt?",
  whatsapp_onboarding_ask_birthyear:
    "In welchem Jahr ist {{childName}} geboren?",
  whatsapp_onboarding_ask_consent:
    "Duerfen wir deine Kontaktdaten speichern, um dich ueber Trainings und Spiele zu informieren? (Ja/Nein)",
  whatsapp_onboarding_no_match:
    "Wir konnten kein Kind mit diesem Namen finden. Bitte kontaktiere den Trainer direkt.",
  whatsapp_onboarding_birthyear_mismatch:
    "Das Geburtsjahr stimmt nicht ueberein. Bitte versuche es nochmal.",
  whatsapp_onboarding_consent_declined:
    "Okay, wir speichern keine Daten. Du kannst dich jederzeit melden, wenn du es dir anders ueberlegst.",
  whatsapp_onboarding_complete:
    "Alles klar! Du bist jetzt registriert als Elternteil von {{childName}}. Du kannst nun per Nachricht Ab- oder Zusagen senden.",
  whatsapp_confirm_attending:
    "{{playerName}} ist fuer {{eventTitle}} am {{eventDate}} angemeldet.",
  whatsapp_confirm_absent:
    "{{playerName}} ist fuer {{eventTitle}} am {{eventDate}} abgemeldet.",
  whatsapp_confirm_waitlist:
    "{{playerName}} steht auf der Warteliste fuer {{eventTitle}} am {{eventDate}}.",
  whatsapp_disambiguate: "Fuer welches Kind?\n{{options}}",
  whatsapp_help:
    "Sende den Namen deines Kindes mit 'kommt' oder 'kommt nicht', z.B. 'Luca kommt' oder 'Luca ist krank'.",
  whatsapp_reminder_with_link:
    "Erinnerung: {{eventTitle}} am {{eventDate}}. Bitte gib Bescheid!\n\nOnline antworten: {{url}}",
  whatsapp_coach_attendance_overview:
    "📋 {{eventTitle}} am {{eventDate}}\n✅ {{attending}}\n❌ {{absent}}\n❓ {{pending}}",
  whatsapp_coach_event_cancelled:
    "{{eventTitle}} am {{eventDate}} wurde abgesagt. Alle Eltern wurden benachrichtigt.",
  whatsapp_coach_cancellation_notice:
    "{{eventTitle}} am {{eventDate}} wurde abgesagt.",
  whatsapp_coach_reminder_sent:
    "{{count}} Erinnerungen fuer {{eventTitle}} gesendet.",
  whatsapp_coach_mark_confirmed:
    "{{playerName}} ist fuer {{eventTitle}} als {{status}} markiert.",
  whatsapp_coach_no_event: "Kein bevorstehendes Event gefunden.",
  whatsapp_coach_player_not_found: "Spieler '{{name}}' nicht gefunden.",
  whatsapp_coach_admin_link:
    "Diese Funktion ist im Webportal verfuegbar: {{url}}",
  attendance_confirmed_label: "anwesend",
  attendance_absent_label: "abwesend",
  whatsapp_coach_help:
    "Verfuegbare Befehle:\n- Wer kommt?\n- Aufstellung?\n- Training absagen\n- Erinnerung senden\n- [Name] anwesend/abwesend",
};

export default de;
