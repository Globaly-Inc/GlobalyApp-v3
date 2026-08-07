import type { AdminListRow } from "../../../components/admin-placeholder-view";
import type { CategoryTab } from "../types";

export type CategoriesByTab = Record<CategoryTab, AdminListRow[]>;
