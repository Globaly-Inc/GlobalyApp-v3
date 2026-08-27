import { subscribersListMockApi, subscribersExportMockApi } from "./mock-data";
import { subscribersListRealApi, subscribersExportRealApi } from "./real-api";
import type { SubscribersResponse, Subscriber } from "./types";

export type { SubscribersResponse, Subscriber };

const useMock = process.env.NEXT_PUBLIC_MOCK_DATA === "true";

export const subscribersApi = {
  list: (page?: number, limit?: number, type?: string, search?: string) =>
    useMock ? subscribersListMockApi(page, limit, type, search) : subscribersListRealApi(page, limit, type, search),
  export: (type?: string, search?: string) =>
    useMock ? subscribersExportMockApi(type, search) : subscribersExportRealApi(type, search),
};
