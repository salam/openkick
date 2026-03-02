const fr: Record<string, string> = {
  welcome: "Bienvenue sur OpenKick!",
  attendance_confirmed: "{{name}} est marqué(e) comme présent(e).",
  attendance_absent: "{{name}} est marqué(e) comme absent(e).",
  reminder: "Rappel : Merci de t'inscrire pour {{event}}.",
  event_created: "Nouvel événement créé : {{title}}",
  deadline_approaching:
    "La date limite d'inscription pour {{event}} est le {{date}}.",
  waitlist_added:
    "{{name}} est sur la liste d'attente pour {{event}}.",
  waitlist_promoted:
    "{{name}} a obtenu une place pour {{event}} !",
  training_headsup:
    "Entraînement demain à {{time}}, {{location}}. Météo : {{weather}}.",
  rain_alert: "Attention : L'entraînement est annulé en raison de la pluie !",
  cancellation: "L'entraînement du {{date}} est annulé.",
  holiday_announcement:
    "Vacances scolaires : {{name}} du {{start}} au {{end}}. Pas d'entraînement.",
  onboarding_ask_name: "Merci d'envoyer le nom de votre enfant.",
  consent_notice:
    "Nous ne conservons que le nom et le numéro de téléphone.",
  whatsapp_welcome: "Bienvenue chez {{teamName}} !",
  whatsapp_onboarding_ask_name: "Comment tu t'appelles ?",
  whatsapp_onboarding_ask_child:
    "Comment s'appelle ton enfant qui joue dans l'equipe ?",
  whatsapp_onboarding_ask_birthyear:
    "En quelle annee est ne(e) {{childName}} ?",
  whatsapp_onboarding_ask_consent:
    "Pouvons-nous enregistrer tes coordonnees pour t'informer des entrainements et des matchs ? (Oui/Non)",
  whatsapp_onboarding_no_match:
    "Nous n'avons pas trouve d'enfant avec ce nom. Contacte directement l'entraineur.",
  whatsapp_onboarding_birthyear_mismatch:
    "L'annee de naissance ne correspond pas. Reessaie.",
  whatsapp_onboarding_consent_declined:
    "D'accord, nous ne conserverons aucune donnee. N'hesite pas a revenir si tu changes d'avis.",
  whatsapp_onboarding_complete:
    "C'est tout bon ! Tu es maintenant inscrit(e) comme parent de {{childName}}. Tu peux envoyer des messages de presence a tout moment.",
  whatsapp_confirm_attending:
    "{{playerName}} est inscrit(e) pour {{eventTitle}} le {{eventDate}}.",
  whatsapp_confirm_absent:
    "{{playerName}} est desinscrit(e) pour {{eventTitle}} le {{eventDate}}.",
  whatsapp_confirm_waitlist:
    "{{playerName}} est sur la liste d'attente pour {{eventTitle}} le {{eventDate}}.",
  whatsapp_disambiguate: "Pour quel enfant ?\n{{options}}",
  whatsapp_help:
    "Envoie le nom de ton enfant avec 'present' ou 'absent', par ex. 'Luca est la' ou 'Luca est malade'.\n\nTu peux aussi utiliser le portail web : {{url}}\n\n(by OpenKick)",
  whatsapp_reminder_with_link:
    "Rappel : {{eventTitle}} le {{eventDate}}. Merci de repondre !\n\nRepondre en ligne : {{url}}",
  whatsapp_coach_attendance_overview:
    "📋 {{eventTitle}} le {{eventDate}}\n✅ {{attending}}\n❌ {{absent}}\n❓ {{pending}}",
  whatsapp_coach_event_cancelled:
    "{{eventTitle}} le {{eventDate}} a ete annule. Tous les parents ont ete informes.",
  whatsapp_coach_cancellation_notice:
    "{{eventTitle}} le {{eventDate}} a ete annule.",
  whatsapp_coach_reminder_sent:
    "{{count}} rappels envoyes pour {{eventTitle}}.",
  whatsapp_coach_mark_confirmed:
    "{{playerName}} est marque(e) comme {{status}} pour {{eventTitle}}.",
  whatsapp_coach_no_event: "Aucun evenement a venir.",
  whatsapp_coach_player_not_found: "Joueur '{{name}}' non trouve.",
  whatsapp_coach_admin_link:
    "Cette fonction est disponible dans le portail web : {{url}}",
  attendance_confirmed_label: "present",
  attendance_absent_label: "absent",
  whatsapp_coach_help:
    "Commandes disponibles :\n- Qui vient ?\n- Composition ?\n- Annuler l'entrainement\n- Envoyer un rappel\n- [Nom] present/absent",
};

export default fr;
