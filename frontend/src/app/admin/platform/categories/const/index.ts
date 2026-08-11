import type { CategoryTab } from "../types";

export const CATEGORY_TABS: { value: CategoryTab; label: string }[] = [
  { value: "business", label: "Business Categories" },
  { value: "service", label: "Service Categories" },
  { value: "degree_levels", label: "Degree Levels" },
  { value: "areas_of_study", label: "Areas of Study" },
  { value: "fee_types", label: "Fee Types" },
  { value: "accreditations", label: "Accreditations" },
];

export const ADD_LABEL: Record<CategoryTab, string | null> = {
  business: "Add business category",
  service: "Add service category",
  degree_levels: "Add level",
  areas_of_study: "Add area",
  fee_types: "Add fee type",
  accreditations: "Add accreditation",
};
