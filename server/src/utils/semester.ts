export interface StatsPeriod {
  start: string;
  end: string;
  label: string;
  type: "spring" | "autumn" | "school_year";
}

export function getSemesterBounds(date: Date): StatsPeriod {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed

  if (month >= 1 && month <= 6) {
    return {
      start: `${year}-02-01`,
      end: `${year}-07-31`,
      label: `Spring ${year}`,
      type: "spring",
    };
  }

  if (month >= 7) {
    return {
      start: `${year}-08-01`,
      end: `${year + 1}-01-31`,
      label: `Autumn ${year}/${(year + 1).toString().slice(2)}`,
      type: "autumn",
    };
  }

  // Jan (0) -> autumn semester from previous August
  return {
    start: `${year - 1}-08-01`,
    end: `${year}-01-31`,
    label: `Autumn ${year - 1}/${year.toString().slice(2)}`,
    type: "autumn",
  };
}

export function getSchoolYearBounds(date: Date): StatsPeriod {
  const year = date.getFullYear();
  const month = date.getMonth();
  const startYear = month >= 7 ? year : year - 1;
  return {
    start: `${startYear}-08-01`,
    end: `${startYear + 1}-07-31`,
    label: `${startYear}/${(startYear + 1).toString().slice(2)}`,
    type: "school_year",
  };
}

export function parsePeriodParam(param?: string): StatsPeriod {
  if (!param || param === "current") {
    return getSemesterBounds(new Date());
  }
  if (param === "current-year") {
    return getSchoolYearBounds(new Date());
  }

  const springMatch = param.match(/^spring-(\d{4})$/);
  if (springMatch) {
    const y = parseInt(springMatch[1], 10);
    return { start: `${y}-02-01`, end: `${y}-07-31`, label: `Spring ${y}`, type: "spring" };
  }

  const autumnMatch = param.match(/^autumn-(\d{4})$/);
  if (autumnMatch) {
    const y = parseInt(autumnMatch[1], 10);
    return {
      start: `${y}-08-01`,
      end: `${y + 1}-01-31`,
      label: `Autumn ${y}/${(y + 1).toString().slice(2)}`,
      type: "autumn",
    };
  }

  const yearMatch = param.match(/^year-(\d{4})$/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    return {
      start: `${y}-08-01`,
      end: `${y + 1}-07-31`,
      label: `${y}/${(y + 1).toString().slice(2)}`,
      type: "school_year",
    };
  }

  // Fallback: current semester
  return getSemesterBounds(new Date());
}
