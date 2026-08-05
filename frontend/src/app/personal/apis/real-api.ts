import { httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type { StudentProfile, StudentProfilePatch, UpdateSubCategoryParams } from "./types";

export const personalRealApi = {
  getMyProfile: (): Promise<StudentProfile> => httpGet("/students/me"),
  updateMyProfile: (patch: StudentProfilePatch): Promise<StudentProfile> => httpPatch("/students/me", patch),
  updateSubCategory: (params: UpdateSubCategoryParams): Promise<void> => httpPost("/user/update", params),
};
