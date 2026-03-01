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
      { label: "cl_admin_insurance", sortOrder: 1 },
      { label: "cl_admin_accident", sortOrder: 2 },
      { label: "cl_admin_certs", sortOrder: 3 },
      { label: "cl_admin_permits", sortOrder: 4 },
      { label: "cl_admin_consent", sortOrder: 5 },
      { label: "cl_admin_firstaid", sortOrder: 6 },
      { label: "cl_admin_bills", sortOrder: 7 },
    ],
  },
  {
    type: "admin",
    classificationFilter: "sportamt_zurich",
    items: [
      { label: "cl_admin_sportamt_reg", sortOrder: 10 },
      { label: "cl_admin_sportamt_sub", sortOrder: 11 },
    ],
  },
  {
    type: "admin",
    classificationFilter: "sfv",
    items: [
      { label: "cl_admin_sfv_reg", sortOrder: 20 },
      { label: "cl_admin_sfv_coach", sortOrder: 21 },
    ],
  },
  {
    type: "admin",
    classificationFilter: "fvrz",
    items: [
      { label: "cl_admin_fvrz_reg", sortOrder: 30 },
      { label: "cl_admin_fvrz_ref", sortOrder: 31 },
    ],
  },
  {
    type: "training",
    classificationFilter: null,
    items: [
      { label: "cl_training_equipment", sortOrder: 1 },
      { label: "cl_training_firstaid", sortOrder: 2 },
      { label: "cl_training_attendance", sortOrder: 3 },
      { label: "cl_training_field", sortOrder: 4 },
      { label: "cl_training_drinks", sortOrder: 5 },
    ],
  },
  {
    type: "tournament",
    classificationFilter: null,
    items: [
      { label: "cl_tournament_reg", sortOrder: 1 },
      { label: "cl_tournament_teams", sortOrder: 2 },
      { label: "cl_tournament_jerseys_order", sortOrder: 3 },
      { label: "cl_tournament_jerseys_pack", sortOrder: 4 },
      { label: "cl_tournament_rules", sortOrder: 5 },
      { label: "cl_tournament_transport", sortOrder: 6 },
      { label: "cl_tournament_passes", sortOrder: 7 },
      { label: "cl_tournament_feedback", sortOrder: 8 },
    ],
  },
];
