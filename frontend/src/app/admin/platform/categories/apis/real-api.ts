import { httpGet } from "@/lib/api/http";
import type { CategoriesByTab } from "./types";

export const categoriesRealApi = {
  getCategories: (): Promise<CategoriesByTab> => httpGet("/admin/categories"),
};
