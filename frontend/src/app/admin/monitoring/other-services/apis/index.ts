import { createApi } from "@/lib/api/create-api";
import { adminOtherServicesMockApi } from "./mock-data";
import { adminOtherServicesRealApi } from "./real-api";

export const adminOtherServicesApi = createApi({ mock: adminOtherServicesMockApi, real: adminOtherServicesRealApi });

export type {
  AdminServiceListing,
  AdminServiceOrder,
  AdminServicesStats,
  Paginated,
} from "./types";
