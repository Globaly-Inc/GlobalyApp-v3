import { httpGet, httpPatch } from "@/lib/api/http";
import type { BusinessProfile, BusinessProfilePatch, UpdateSubCategoryParams } from "./types";

export const businessRealApi = {
  // There is no POST /user/update. The business sub-category is `business_type` on the
  // business profile — PATCH /businesses/me is the real endpoint for it.
  updateSubCategory: async (params: UpdateSubCategoryParams): Promise<void> => {
    await httpPatch("/businesses/me", { business_type: params.sub_category });
  },

  getMyProfile: (): Promise<BusinessProfile> => httpGet("/businesses/me"),
  updateMyProfile: (patch: BusinessProfilePatch): Promise<BusinessProfile> => httpPatch("/businesses/me", patch),
};
