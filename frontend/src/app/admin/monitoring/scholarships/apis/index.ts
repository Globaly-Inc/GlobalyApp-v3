// Shipped page — the mock path is deleted per §1.4 ("each shipped page deletes
// its mock path"). createApi is not used here because there is no mock half left
// to choose between.

import { scholarshipsRealApi } from "./real-api";

export const scholarshipsApi = scholarshipsRealApi;
export type {
  ListScholarshipsParams,
  ReviewStatus,
  Scholarship,
  ScholarshipStats,
} from "./types";
