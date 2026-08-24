import { createApi } from "@/lib/api/create-api";
import { businessEventsMockApi } from "./mock-data";
import { businessEventsRealApi } from "./real-api";

export const businessEventsApi = createApi({ mock: businessEventsMockApi, real: businessEventsRealApi });
export type {
  EventItem,
  EventInput,
  EventStatus,
  EventVisibility,
  EventType,
  PaginatedResult,
  TicketItem,
  TicketInput,
  RegistrationItem,
  RegistrationInput,
  RegistrationStatus,
  CoHostItem,
  CoHostStatus,
  UpdateItem,
} from "./types";
