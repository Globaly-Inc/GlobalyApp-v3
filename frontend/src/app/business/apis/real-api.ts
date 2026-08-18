import { httpGet, httpPatch, httpPostForm } from "@/lib/api/http";
import type { BusinessProfile, BusinessProfilePatch, SelectOption, UpdateSubCategoryParams } from "./types";

export const businessRealApi = {
  // There is no POST /user/update. The business sub-category is `business_type` on the
  // business profile — PATCH /businesses/me is the real endpoint for it.
  updateSubCategory: async (params: UpdateSubCategoryParams): Promise<void> => {
    await httpPatch("/businesses/me", { business_type: params.sub_category });
  },

  getMyProfile: (): Promise<BusinessProfile> => httpGet("/businesses/me"),
  updateMyProfile: (patch: BusinessProfilePatch): Promise<BusinessProfile> => httpPatch("/businesses/me", patch),

  uploadImage: (category: "logo" | "cover", file: File): Promise<{ storage_path: string }> => {
    const form = new FormData();
    form.append("file", file);
    return httpPostForm(`/businesses/me/files?category=${category}`, form);
  },

  getBusinessCategories: async (search?: string): Promise<SelectOption[]> => {
    const q = new URLSearchParams({ limit: "10" });
    if (search) q.set("search", search);
    const { data } = await httpGet<{ data: { id: number; name: string }[] }>(`/businesses/business-categories?${q}`);
    return data.map((c) => ({ value: String(c.id), label: c.name }));
  },
};
