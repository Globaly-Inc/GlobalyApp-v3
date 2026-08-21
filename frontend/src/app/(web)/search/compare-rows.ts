import type { CompareCourseItem } from "./types";

/** Field rows shared by the /compare page and the floating tray's inline comparison. */
export const COMPARE_ROWS: { label: string; get: (i: CompareCourseItem) => string }[] = [
  { label: "Institution", get: (i) => i.institutionName ?? "—" },
  { label: "Country", get: (i) => i.countryName ?? "—" },
  { label: "Subject Area", get: (i) => i.subjectArea ?? "—" },
  { label: "Duration", get: (i) => i.durationLabel ?? "—" },
  { label: "Next Intake", get: (i) => i.nextIntakeLabel ?? "Intake TBC" },
  {
    label: "Annual Tuition",
    get: (i) => (i.annualTuition != null ? `${i.feeCurrency ?? "AUD"} ${i.annualTuition.toLocaleString()}` : "Fees on enquiry"),
  },
];
