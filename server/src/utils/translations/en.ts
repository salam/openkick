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
    "Send your child's name with 'attending' or 'absent', e.g. 'Luca is coming' or 'Luca is sick'.",
  whatsapp_reminder_with_link:
    "Reminder: {{eventTitle}} on {{eventDate}}. Please respond!\n\nRespond online: {{url}}",
};

export default en;
