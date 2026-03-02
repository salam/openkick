'use client';

interface Props {
  value: string;
  onChange: (period: string) => void;
}

function generateOptions() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const options: { value: string; label: string }[] = [];

  // Current semester first
  if (month >= 1 && month <= 6) {
    options.push({ value: `spring-${year}`, label: `Spring ${year}` });
  } else if (month >= 7) {
    options.push({ value: `autumn-${year}`, label: `Autumn ${year}/${(year + 1).toString().slice(2)}` });
  } else {
    options.push({ value: `autumn-${year - 1}`, label: `Autumn ${year - 1}/${year.toString().slice(2)}` });
  }

  // Previous 3 semesters
  for (let i = 1; i <= 3; i++) {
    const currentIsSpring = month >= 1 && month <= 6;
    if (currentIsSpring) {
      if (i === 1) options.push({ value: `autumn-${year - 1}`, label: `Autumn ${year - 1}/${year.toString().slice(2)}` });
      if (i === 2) options.push({ value: `spring-${year - 1}`, label: `Spring ${year - 1}` });
      if (i === 3) options.push({ value: `autumn-${year - 2}`, label: `Autumn ${year - 2}/${(year - 1).toString().slice(2)}` });
    } else {
      const baseYear = month >= 7 ? year : year - 1;
      if (i === 1) options.push({ value: `spring-${baseYear}`, label: `Spring ${baseYear}` });
      if (i === 2) options.push({ value: `autumn-${baseYear - 1}`, label: `Autumn ${baseYear - 1}/${baseYear.toString().slice(2)}` });
      if (i === 3) options.push({ value: `spring-${baseYear - 1}`, label: `Spring ${baseYear - 1}` });
    }
  }

  // School years
  const schoolYearStart = month >= 7 ? year : year - 1;
  options.push({ value: `year-${schoolYearStart}`, label: `School Year ${schoolYearStart}/${(schoolYearStart + 1).toString().slice(2)}` });
  options.push({ value: `year-${schoolYearStart - 1}`, label: `School Year ${schoolYearStart - 1}/${schoolYearStart.toString().slice(2)}` });

  return options;
}

export default function SemesterPicker({ value, onChange }: Props) {
  const options = generateOptions();

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
