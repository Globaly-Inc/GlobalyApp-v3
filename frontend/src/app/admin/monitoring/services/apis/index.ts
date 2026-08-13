import { createApi } from "@/lib/api/create-api";
import { adminServicesMockApi } from "./mock-data";
import { adminServicesRealApi } from "./real-api";

export const adminServicesApi = createApi({ mock: adminServicesMockApi, real: adminServicesRealApi });

export type {
  AdminServiceListing,
  AdminServiceOrder,
  AdminServicesStats,
  Paginated,
} from "./types";
