import { createApi } from "@/lib/api/create-api";
import { visasMockApi } from "./mock-data";
import { visasRealApi } from "./real-api";

export const visasApi = createApi({ mock: visasMockApi, real: visasRealApi });
export type { VisaSummary } from "./types";
