import type { ComboboxOption } from "@/components/combobox";
import type { StatusFilter } from "../types";

export const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "featured", label: "Featured" },
];

export const SOURCE_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "university", label: "University" },
  { value: "independent", label: "Independent" },
  { value: "government", label: "Government" },
  { value: "foundation", label: "Foundation" },
  { value: "other", label: "Other" },
];

export const BASIS_OPTIONS: ComboboxOption[] = [
  { value: "merit", label: "Merit" },
  { value: "need", label: "Need" },
  { value: "sports", label: "Sports" },
  { value: "diversity", label: "Diversity" },
  { value: "government", label: "Government" },
  { value: "research", label: "Research" },
  { value: "other", label: "Other" },
];

export const COVERAGE_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "full_tuition", label: "Full tuition" },
  { value: "partial_tuition", label: "Partial tuition" },
  { value: "stipend", label: "Stipend" },
  { value: "living_allowance", label: "Living allowance" },
  { value: "various", label: "Various" },
  { value: "other", label: "Other" },
];

export const DEGREE_LEVEL_OPTIONS = [
  "certificate", "diploma", "associate", "bachelor",
  "graduate_certificate", "graduate_diploma", "master", "doctoral", "other",
] as const;
