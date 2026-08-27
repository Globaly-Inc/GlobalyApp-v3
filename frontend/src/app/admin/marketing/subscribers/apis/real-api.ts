import { httpGet, httpBlob } from "@/lib/api/http";
import type { SubscribersResponse } from "./types";

const BASE = "/api/v3/admin/marketing";

export const subscribersListRealApi = async (page = 1, limit = 20, type?: string, search?: string): Promise<SubscribersResponse> => {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  if (type) params.set("type", type);
  if (search) params.set("search", search);

  return httpGet(`${BASE}/subscribers?${params}`);
};

export const subscribersExportRealApi = async (type?: string, search?: string): Promise<Blob> => {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (search) params.set("search", search);

  return httpBlob(`${BASE}/subscribers/export.csv?${params}`);
};
