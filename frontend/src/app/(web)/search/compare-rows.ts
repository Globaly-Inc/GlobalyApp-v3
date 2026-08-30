import type { CompareCourseItem } from "./types";

type CompareRow = { label: string; get: (i: CompareCourseItem) => string };

const formatTuition = (i: CompareCourseItem) =>
  i.annualTuition != null
    ? `${i.feeCurrency ?? "AUD"} ${i.annualTuition.toLocaleString()}`
    : "Fees on enquiry";

/** Flat rows — used by the floating compare tray's inline table. */
export const COMPARE_ROWS: CompareRow[] = [
  { label: "Institution", get: (i) => i.institutionName ?? "—" },
  { label: "Country", get: (i) => i.countryName ?? "—" },
  { label: "Subject Area", get: (i) => i.subjectArea ?? "—" },
  { label: "Duration", get: (i) => i.durationLabel ?? "—" },
  { label: "Next Intake", get: (i) => i.nextIntakeLabel ?? "Intake TBC" },
  { label: "Annual Tuition", get: formatTuition },
];

/** Grouped rows — used by the /compare page for section headers. */
export const COMPARE_GROUPS: { label: string; rows: CompareRow[] }[] = [
  {
    label: "Course Overview",
    rows: [
      { label: "Institution", get: (i) => i.institutionName ?? "—" },
      { label: "Location", get: (i) => i.countryName ?? "—" },
      { label: "Duration", get: (i) => i.durationLabel ?? "—" },
      { label: "Field of Study", get: (i) => i.subjectArea ?? "—" },
    ],
  },
  {
    label: "Fees",
    rows: [{ label: "Annual Tuition", get: formatTuition }],
  },
  {
    label: "Intake",
    rows: [{ label: "Next Intake", get: (i) => i.nextIntakeLabel ?? "Intake TBC" }],
  },
];
