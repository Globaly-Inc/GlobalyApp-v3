import { createApi } from "@/lib/api/create-api";
import { personalMockApi } from "./mock-data";
import { personalRealApi } from "./real-api";

export const personalApi = createApi({ mock: personalMockApi, real: personalRealApi });
export type {
  StudentProfile,
  StudentProfilePatch,
  FullProfile,
  Qualification,
  QualificationInput,
  LanguageTest,
  LanguageTestInput,
  WorkExperience,
  WorkExperienceInput,
} from "./types";
