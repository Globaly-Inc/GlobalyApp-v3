import { httpGet } from "@/lib/api/http";
import type { AdminEvent } from "./types";

export const eventsRealApi = {
  getEvents: (): Promise<AdminEvent[]> => httpGet("/admin/events"),
};
