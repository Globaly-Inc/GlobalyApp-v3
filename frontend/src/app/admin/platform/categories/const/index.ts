import type { AdminListColumn } from "../../../components/admin-placeholder-view";
import type { CategoryTab } from "../types";

export const CATEGORY_TABS: { value: CategoryTab; label: string }[] = [
  { value: "business", label: "Business Categories" },
  { value: "service", label: "Service Categories" },
  { value: "degree_levels", label: "Degree Levels" },
  { value: "areas_of_study", label: "Areas of Study" },
  { value: "fee_types", label: "Fee Types" },
  { value: "accreditations", label: "Accreditations" },
  { value: "search_module", label: "Search Module" },
];

export const CATEGORY_COLUMNS: Record<CategoryTab, AdminListColumn[]> = {
  business: [{ key: "name", label: "Name" }, { key: "slug", label: "Slug" }, { key: "count", label: "Businesses" }],
  service: [{ key: "name", label: "Name" }, { key: "slug", label: "Slug" }, { key: "count", label: "Services" }],
  degree_levels: [{ key: "name", label: "Name" }, { key: "sort", label: "Sort order" }],
  areas_of_study: [{ key: "name", label: "Name" }, { key: "parent", label: "Parent" }],
  fee_types: [{ key: "name", label: "Name" }, { key: "code", label: "Code" }],
  accreditations: [{ key: "name", label: "Name" }, { key: "country", label: "Country" }],
  search_module: [{ key: "name", label: "Field" }, { key: "type", label: "Type" }],
};
