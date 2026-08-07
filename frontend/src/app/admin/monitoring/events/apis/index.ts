import { createApi } from "@/lib/api/create-api";
import { eventsMockApi } from "./mock-data";
import { eventsRealApi } from "./real-api";

export const eventsApi = createApi({ mock: eventsMockApi, real: eventsRealApi });
export type { AdminEvent } from "./types";
