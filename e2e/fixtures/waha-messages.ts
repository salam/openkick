/**
 * Mock WAHA webhook payloads for WhatsApp attendance testing.
 * Phone numbers must match a guardian seeded in the DB.
 */

export const GUARDIAN_PHONE = "4917612345678";
export const GUARDIAN_CHAT_ID = `${GUARDIAN_PHONE}@c.us`;

export function wahaMessage(body: string, id?: string): Record<string, unknown> {
  return {
    event: "message",
    payload: {
      id: id ?? `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      from: GUARDIAN_CHAT_ID,
      body,
      hasMedia: false,
      fromMe: false,
    },
  };
}

/** "Ava kommt, Marlo nicht" — Ava attending, Marlo absent for next event */
export const MSG_AVA_YES_MARLO_NO = wahaMessage("Ava kommt, Marlo nicht", "msg_test_001");

/** "Ava kann nächste Woche nicht. Marlo kann diese Woche nicht." — date-aware absences */
export const MSG_DATE_AWARE_ABSENCES = wahaMessage(
  "Ava kann nächste Woche nicht. Marlo kann diese Woche nicht.",
  "msg_test_002"
);

/**
 * Canned LLM response for "Ava kommt, Marlo nicht".
 * The WhatsApp handler calls chatCompletion to parse intent.
 * This is what we return from the mock.
 */
export const LLM_RESPONSE_AVA_YES_MARLO_NO = JSON.stringify([
  { playerName: "Ava", status: "attending", date: null, reason: null },
  { playerName: "Marlo", status: "absent", date: null, reason: null },
]);

export const LLM_RESPONSE_DATE_AWARE = JSON.stringify([
  { playerName: "Ava", status: "absent", date: "next_week", reason: "kann nicht" },
  { playerName: "Marlo", status: "absent", date: "this_week", reason: "kann nicht" },
]);
