// Shipped page — the mock path is deleted per §1.4 ("each shipped page deletes
// its mock path"). createApi is not used here because there is no mock half left
// to choose between.
//
// This page replaced an AdminPlaceholderView with hardcoded ROWS and no api/ or
// store/ directory: §3.8 listed it as MOCK-ONLY, and the `application_charges`
// table did not exist either.

import { applicationChargesRealApi } from "./real-api";

export const applicationChargesApi = applicationChargesRealApi;
export type {
  ApplicationCharge,
  ChargeStats,
  ChargeStatus,
  ListChargesParams,
  VoidResult,
} from "./types";
