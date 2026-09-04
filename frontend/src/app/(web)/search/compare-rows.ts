import { amountLabel } from "@/lib/utils";
import { DEGREE_LABEL, type CompareCourseItem, type CourseDetail } from "./types";

type CompareRow = {
  label: string;
  get: (i: CompareCourseItem, detail?: CourseDetail) => string;
};

const formatTuition = (i: CompareCourseItem) =>
  amountLabel(i.annualTuition, i.feeCurrency ?? "AUD") ?? "Fees on enquiry";

const eligibilityFor = (detail: CourseDetail | undefined, applicableTo: string) =>
  detail?.eligibility.find((e) => e.applicable_to === applicableTo || e.applicable_to === "both")?.description ?? "—";

/** Grouped rows — used by the /compare page for section headers. */
export const COMPARE_GROUPS: { label: string; rows: CompareRow[] }[] = [
  {
    label: "Course Details",
    rows: [
      { label: "Subject Area", get: (i) => i.subjectArea ?? "—" },
      { label: "Duration", get: (i) => i.durationLabel ?? "—" },
      { label: "Next Intake", get: (i) => i.nextIntakeLabel ?? "Intake TBC" },
      { label: "Annual Tuition", get: formatTuition },
    ],
  },
  {
    label: "Qualification",
    rows: [
      { label: "Level", get: (i) => (i.level ? DEGREE_LABEL[i.level] ?? i.level : "—") },
      { label: "Domestic Requirement", get: (_i, detail) => eligibilityFor(detail, "domestic") },
      { label: "International Requirement", get: (_i, detail) => eligibilityFor(detail, "international") },
    ],
  },
  {
    label: "Fee Detail",
    rows: [
      {
        label: "Installment Type",
        get: (i, detail) => {
          const count = detail?.domestic_fee_installments?.length ?? 0;
          if (count > 1) return "Per Instalment";
          return i.annualTuition != null ? "Per Year" : "—";
        },
      },
      {
        label: "Fees Type",
        get: (_i, detail) => {
          if (!detail) return "—";
          return (detail.domestic_fee_installments?.length ?? 0) > 1 ? "Instalments" : "Full Payment";
        },
      },
    ],
  },
];
