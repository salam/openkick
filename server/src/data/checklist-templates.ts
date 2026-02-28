export interface TemplateSeed {
  type: "admin" | "training" | "tournament";
  classificationFilter: string | null;
  items: { label: string; sortOrder: number }[];
}

export const CHECKLIST_TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    type: "admin",
    classificationFilter: null,
    items: [
      { label: "Liability insurance (Haftpflichtversicherung) valid and renewed", sortOrder: 1 },
      { label: "Accident insurance for players confirmed", sortOrder: 2 },
      { label: "Coach certifications (J+S, SFV C-Diploma) up to date", sortOrder: 3 },
      { label: "Facility usage permits / field reservations secured", sortOrder: 4 },
      { label: "Parent consent forms / disclaimers collected for all players", sortOrder: 5 },
      { label: "First-aid kit inspected and restocked", sortOrder: 6 },
      { label: "Bills and invoices paid (membership fees, tournament fees)", sortOrder: 7 },
    ],
  },
  {
    type: "admin",
    classificationFilter: "sportamt_zurich",
    items: [
      { label: "Registration with Sportamt Zurich submitted", sortOrder: 10 },
      { label: "Sportamt Zurich subsidy application filed", sortOrder: 11 },
    ],
  },
  {
    type: "admin",
    classificationFilter: "sfv",
    items: [
      { label: "SFV team registration and licence fees paid", sortOrder: 20 },
      { label: "SFV coach licence renewals submitted", sortOrder: 21 },
    ],
  },
  {
    type: "admin",
    classificationFilter: "fvrz",
    items: [
      { label: "FVRZ league registration submitted", sortOrder: 30 },
      { label: "FVRZ referee assignments acknowledged", sortOrder: 31 },
    ],
  },
  {
    type: "training",
    classificationFilter: null,
    items: [
      { label: "Balls, cones, bibs packed", sortOrder: 1 },
      { label: "First-aid kit available", sortOrder: 2 },
      { label: "Attendance taken", sortOrder: 3 },
      { label: "Field condition checked", sortOrder: 4 },
      { label: "Water / drinks reminder sent to parents", sortOrder: 5 },
    ],
  },
  {
    type: "tournament",
    classificationFilter: null,
    items: [
      { label: "Registration submitted before deadline", sortOrder: 1 },
      { label: "Teams formed and published", sortOrder: 2 },
      { label: "Custom Trikots ordered (sizing via survey)", sortOrder: 3 },
      { label: "Trikots packed and accounted for", sortOrder: 4 },
      { label: "Tournament rules / PDF downloaded and reviewed", sortOrder: 5 },
      { label: "Transport organised (drivers, carpooling)", sortOrder: 6 },
      { label: "Player passes / ID cards prepared", sortOrder: 7 },
      { label: "Post-tournament feedback survey sent", sortOrder: 8 },
    ],
  },
];
