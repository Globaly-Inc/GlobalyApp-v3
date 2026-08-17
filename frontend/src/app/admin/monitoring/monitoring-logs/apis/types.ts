/** Mirrors backend AuditLogRow — superadmin.admin_audit_logs + public.audit_logs, normalised. */
export type AuditLogSource = "admin" | "platform";

export type AuditLogEntry = {
  id: string;
  source: AuditLogSource;
  actor_id: number | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
};

export type AuditLogFilters = {
  source?: AuditLogSource;
  actor_id?: number;
  action?: string;
  entity_type?: string;
  /** "YYYY-MM-DD" or a full ISO timestamp — the backend coerces both. */
  from?: string;
  to?: string;
};

export type ListAuditLogsParams = AuditLogFilters & {
  page?: number;
  limit?: number;
};

export type PaginatedAuditLogs = {
  data: AuditLogEntry[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};
