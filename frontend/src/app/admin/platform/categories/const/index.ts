import type { CategoryTab } from "../types";

export const CATEGORY_TABS: { value: CategoryTab; label: string }[] = [
  { value: "business", label: "Business Categories" },
  { value: "service", label: "Service Categories" },
  { value: "other_service", label: "Other Service Categories" },
  { value: "degree_levels", label: "Degree Levels" },
  { value: "areas_of_study", label: "Areas of Study" },
  { value: "fee_types", label: "Fee Types" },
  { value: "accreditations", label: "Accreditations" },
];

export const ADD_LABEL: Record<CategoryTab, string | null> = {
  business: "Add business category",
  service: "Add service category",
  other_service: "Add other service category",
  degree_levels: "Add level",
  areas_of_study: "Add area",
  fee_types: "Add fee type",
  accreditations: "Add accreditation",
};

/** URL segment for the editor route. "other_service" gets its own so the editor knows which scope to save. */
export const ROUTE_SEGMENT: Record<"business" | "service" | "other_service", string> = {
  business: "business",
  service: "service",
  other_service: "other-service",
};

/**
 * A line under the tab, where the tab's name alone doesn't say who the rows are for.
 *
 * Only Other Service Categories has one: "Other Service Categories" is not self-explanatory, and an admin
 * adding a row here needs to know it lands in a student's dropdown.
 */
export const TAB_DESCRIPTION: Partial<Record<CategoryTab, string>> = {
  other_service:
    "Personal portal service categories are listed as Other Services. These are the only categories a person can " +
    "choose when they publish a service through Earn — they cannot add their own, so anything you add here is " +
    "what they get.",
};
