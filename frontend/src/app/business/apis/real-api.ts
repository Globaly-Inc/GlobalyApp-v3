import { httpGet, httpPatch, httpPost, httpPostForm } from "@/lib/api/http";
import type {
  BusinessProfile, BusinessProfilePatch, BusinessRegisterInput, RegisterBusinessResult, SelectOption,
  UpdateSubCategoryParams,
} from "./types";

export const businessRealApi = {
  updateSubCategory: (params: UpdateSubCategoryParams): Promise<void> => httpPost("/user/update", params),

  registerBusiness: (input: BusinessRegisterInput): Promise<RegisterBusinessResult> =>
    httpPost("/businesses/register", input),

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
