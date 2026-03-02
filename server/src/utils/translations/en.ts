const en: Record<string, string> = {
  welcome: "Welcome to OpenKick!",
  attendance_confirmed: "{{name}} is marked as attending.",
  attendance_absent: "{{name}} is marked as absent.",
  reminder: "Reminder: Please register for {{event}}.",
  event_created: "New event created: {{title}}",
  deadline_approaching:
    "Registration deadline for {{event}} ends on {{date}}.",
  waitlist_added:
    "{{name}} is on the waitlist for {{event}}.",
  waitlist_promoted:
    "{{name}} got a spot for {{event}}!",
  training_headsup:
    "Training tomorrow at {{time}}, {{location}}. Weather: {{weather}}.",
  rain_alert: "Attention: Training is cancelled due to rain!",
  cancellation: "Training on {{date}} is cancelled.",
  holiday_announcement:
    "School holidays: {{name}} from {{start}} to {{end}}. No training.",
  onboarding_ask_name: "Please send your child's name.",
  consent_notice:
    "We only store the name and phone number.",
  whatsapp_welcome: "Welcome to {{teamName}}!",
  whatsapp_onboarding_ask_name: "What's your name?",
  whatsapp_onboarding_ask_child:
    "What's the name of your child who plays on the team?",
  whatsapp_onboarding_ask_birthyear:
    "What year was {{childName}} born?",
  whatsapp_onboarding_ask_consent:
    "May we store your contact details to inform you about trainings and matches? (Yes/No)",
  whatsapp_onboarding_no_match:
    "We couldn't find a child with that name. Please contact the coach directly.",
  whatsapp_onboarding_birthyear_mismatch:
    "The birth year doesn't match. Please try again.",
  whatsapp_onboarding_consent_declined:
    "Okay, we won't store any data. Feel free to reach out if you change your mind.",
  whatsapp_onboarding_complete:
    "All set! You're now registered as a parent of {{childName}}. You can send attendance messages anytime.",
  whatsapp_confirm_attending:
    "{{playerName}} is confirmed for {{eventTitle}} on {{eventDate}}.",
  whatsapp_confirm_absent:
    "{{playerName}} is absent for {{eventTitle}} on {{eventDate}}.",
  whatsapp_confirm_waitlist:
    "{{playerName}} is on the waitlist for {{eventTitle}} on {{eventDate}}.",
  whatsapp_disambiguate: "Which child?\n{{options}}",
  whatsapp_help:
    "Send your child's name with 'attending' or 'absent', e.g. 'Luca is coming' or 'Luca is sick'.\n\nAlternatively, you can use the web frontend: {{url}}\n\n(by OpenKick)",
  whatsapp_reminder_with_link:
    "Reminder: {{eventTitle}} on {{eventDate}}. Please respond!\n\nRespond online: {{url}}",
  whatsapp_coach_attendance_overview:
    "📋 {{eventTitle}} on {{eventDate}}\n✅ {{attending}}\n❌ {{absent}}\n❓ {{pending}}",
  whatsapp_coach_event_cancelled:
    "{{eventTitle}} on {{eventDate}} has been cancelled. All parents have been notified.",
  whatsapp_coach_cancellation_notice:
    "{{eventTitle}} on {{eventDate}} has been cancelled.",
  whatsapp_coach_reminder_sent:
    "{{count}} reminders sent for {{eventTitle}}.",
  whatsapp_coach_mark_confirmed:
    "{{playerName}} is marked as {{status}} for {{eventTitle}}.",
  whatsapp_coach_no_event: "No upcoming event found.",
  whatsapp_coach_player_not_found: "Player '{{name}}' not found.",
  whatsapp_coach_admin_link:
    "This feature is available in the web portal: {{url}}",
  attendance_confirmed_label: "attending",
  attendance_absent_label: "absent",
  whatsapp_coach_help:
    "Available commands:\n- Who's coming?\n- Match sheet?\n- Cancel training\n- Send reminder\n- [Name] attending/absent",
};

export default en;
