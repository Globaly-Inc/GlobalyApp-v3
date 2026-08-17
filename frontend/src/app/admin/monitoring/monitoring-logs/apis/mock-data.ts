import type { AuditLogEntry, ListAuditLogsParams, PaginatedAuditLogs } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockLogs: AuditLogEntry[] = [
  {
    id: "0b5a2d1e-0000-4000-8000-000000000001",
    source: "admin",
    actor_id: 1,
    actor_name: "Priansu Koirala",
    actor_email: "priansu.koirala@globalyhub.com",
    action: "EXTRACTION_JOB_CREATE",
    entity_type: "extraction_job",
    entity_id: "9b1f3d2a-0000-4000-8000-000000000010",
    details: { url: "https://example.edu" },
    ip_address: null,
    created_at: "2026-08-07T09:14:00.000Z",
  },
  {
    id: "0b5a2d1e-0000-4000-8000-000000000002",
    source: "admin",
    actor_id: 1,
    actor_name: "Priansu Koirala",
    actor_email: "priansu.koirala@globalyhub.com",
    action: "ADMIN_INVITE_SENT",
    entity_type: "admin_user",
    entity_id: null,
    details: { role: "data_admin" },
    ip_address: null,
    created_at: "2026-08-06T16:02:00.000Z",
  },
  {
    id: "0b5a2d1e-0000-4000-8000-000000000003",
    source: "platform",
    actor_id: null,
    actor_name: null,
    actor_email: null,
    action: "BUSINESS_APPROVED",
    entity_type: "business",
    entity_id: "acme-education",
    details: {},
    ip_address: "203.0.113.7",
    created_at: "2026-08-06T11:47:00.000Z",
  },
];

function applyFilters(params: ListAuditLogsParams): AuditLogEntry[] {
  return mockLogs.filter((log) => {
    if (params.source && log.source !== params.source) return false;
    if (params.action && log.action !== params.action) return false;
    if (params.entity_type && log.entity_type !== params.entity_type) return false;
    if (params.actor_id !== undefined && log.actor_id !== params.actor_id) return false;
    if (params.from && log.created_at < params.from) return false;
    if (params.to && log.created_at > params.to) return false;
    return true;
  });
}

export const logsMockApi = {
  getLogs: async (params: ListAuditLogsParams = {}): Promise<PaginatedAuditLogs> => {
    console.log("[mock] GET /admin/audit-logs", params);
    await delay(300);
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const filtered = applyFilters(params);
    return {
      data: filtered.slice((page - 1) * limit, page * limit),
      meta: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) },
    };
  },

  getLog: async (id: string): Promise<AuditLogEntry> => {
    console.log("[mock] GET /admin/audit-logs/:id", id);
    await delay(150);
    const found = mockLogs.find((log) => log.id === id);
    if (!found) throw new Error("Audit log not found");
    return found;
  },
};
