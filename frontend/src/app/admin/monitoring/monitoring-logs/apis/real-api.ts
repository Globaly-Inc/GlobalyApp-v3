import { httpGet } from "@/lib/api/http";
import type { AuditLogEntry } from "./types";

export const logsRealApi = {
  getLogs: (): Promise<AuditLogEntry[]> => httpGet("/admin/audit-logs"),
};
