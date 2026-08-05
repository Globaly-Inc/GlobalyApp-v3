import { httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type { BusinessProfile, BusinessProfilePatch, UpdateSubCategoryParams } from "./types";

export const businessRealApi = {
  updateSubCategory: (params: UpdateSubCategoryParams): Promise<void> => httpPost("/user/update", params),

  getMyProfile: (): Promise<BusinessProfile> => httpGet("/businesses/me"),
  updateMyProfile: (patch: BusinessProfilePatch): Promise<BusinessProfile> => httpPatch("/businesses/me", patch),
};
