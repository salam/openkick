export interface CategoryInfo {
  name: string;
  label: string;
  format: string;
  teamSize: number;
  minAge: number;
  maxAge: number;
}

const CATEGORIES: CategoryInfo[] = [
  { name: "G", label: "G-Junioren (U6)", format: "3v3", teamSize: 0, minAge: 0, maxAge: 5 },
  { name: "F", label: "F-Junioren (U8)", format: "3v3/5v5", teamSize: 0, minAge: 6, maxAge: 7 },
  { name: "E", label: "E-Junioren (U10)", format: "5v5/6v6", teamSize: 7, minAge: 8, maxAge: 9 },
  { name: "D-7", label: "D-Junioren D7 (U11)", format: "7v7", teamSize: 7, minAge: 10, maxAge: 10 },
  { name: "D-9", label: "D-Junioren D9 (U12)", format: "9v9", teamSize: 9, minAge: 11, maxAge: 11 },
  { name: "C", label: "C-Junioren (U14)", format: "11v11", teamSize: 11, minAge: 12, maxAge: 13 },
  { name: "B", label: "B-Junioren (U16)", format: "11v11", teamSize: 11, minAge: 14, maxAge: 15 },
  { name: "A", label: "A-Junioren (U18)", format: "11v11", teamSize: 11, minAge: 16, maxAge: 17 },
];

/**
 * Returns the season year based on the given date.
 * The SFV season boundary is July 1: dates on or after July 1 belong to the
 * new season (current calendar year), dates before July 1 belong to the
 * previous season.
 */
export function getSeasonYear(date?: Date): number {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed: 0 = Jan, 6 = Jul
  return month >= 6 ? year : year - 1;
}

/**
 * Returns the SFV category code for a given birth year and season year.
 * The age offset is `seasonYear - birthYear`.
 */
export function getCategoryForBirthYear(
  birthYear: number,
  seasonYear?: number,
): string {
  const sy = seasonYear ?? getSeasonYear();
  const age = sy - birthYear;

  const category = CATEGORIES.find(
    (c) => age >= c.minAge && age <= c.maxAge,
  );

  if (!category) {
    // For very young children (age <= 5), fall into G; for older, fall into A
    if (age <= 5) return "G";
    return "A";
  }

  return category.name;
}

/**
 * Returns all SFV category definitions.
 */
export function getAllCategories(): CategoryInfo[] {
  return [...CATEGORIES];
}

/**
 * Returns the category info for a specific category name, or undefined if not found.
 */
export function getCategoryInfo(category: string): CategoryInfo | undefined {
  return CATEGORIES.find((c) => c.name === category);
}
