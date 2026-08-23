export type CategoryTab =
  | "business"
  | "service"
  | "other_service"
  | "degree_levels"
  | "areas_of_study"
  | "fee_types"
  | "accreditations";

/** The category editor's form fields. Strings throughout — parsed on save, not while typing. */
export type CategoryFormState = {
  name: string;
  slug: string;
  description: string;
  icon: string;
  sortOrder: string;
  isActive: boolean;
};
