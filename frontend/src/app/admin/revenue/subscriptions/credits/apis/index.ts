import { createApi } from "@/lib/api/create-api";
import { creditLedgerMockApi } from "./mock-data";
import { creditLedgerRealApi } from "./real-api";

export const creditLedgerApi = createApi({ mock: creditLedgerMockApi, real: creditLedgerRealApi });

export type { CreditKind, CreditLedgerRow, ListCreditsParams, PaginatedCredits } from "./types";
