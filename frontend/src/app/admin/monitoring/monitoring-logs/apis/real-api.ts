import { httpGet } from "@/lib/api/http";
import type { AuditLogEntry, ListAuditLogsParams, PaginatedAuditLogs } from "./types";

function toQuery(params: ListAuditLogsParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const logsRealApi = {
  getLogs: (params: ListAuditLogsParams = {}): Promise<PaginatedAuditLogs> =>
    httpGet(`/admin/audit-logs${toQuery(params)}`),

  getLog: (id: string): Promise<AuditLogEntry> => httpGet(`/admin/audit-logs/${id}`),
};
