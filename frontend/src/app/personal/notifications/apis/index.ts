import { createApi } from "@/lib/api/create-api";
import { notificationsMockApi } from "./mock-data";
import { notificationsRealApi } from "./real-api";

export const notificationsApi = createApi({ mock: notificationsMockApi, real: notificationsRealApi });
export type { UnreadCount } from "./types";
