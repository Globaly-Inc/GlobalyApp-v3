import { createApi } from "@/lib/api/create-api";
import { creditsLedgerMockApi } from "./mock-data";
import { creditsLedgerRealApi } from "./real-api";

export const creditsLedgerApi = createApi({ mock: creditsLedgerMockApi, real: creditsLedgerRealApi });
export type { LedgerEntry, LedgerPage, UserSearchResult, AdjustInput, CreditReason } from "./types";
