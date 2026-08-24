import { createApi } from "@/lib/api/create-api";
import { businessEventsMockApi } from "./mock-data";
import { businessEventsRealApi } from "./real-api";

export const businessEventsApi = createApi({ mock: businessEventsMockApi, real: businessEventsRealApi });
export type { CreateEventInput, Event, EventStatus, Registrant, UpdateEventInput } from "./types";
