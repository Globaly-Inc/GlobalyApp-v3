import type { AuditLogEntry } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockLogs: AuditLogEntry[] = [
  { id: 1, actor: "priansu.koirala@globalyhub.com", action: "EXTRACTION_JOB_CREATE", when: "2026-08-07 09:14" },
  { id: 2, actor: "priansu.koirala@globalyhub.com", action: "ADMIN_INVITE_SENT", when: "2026-08-06 16:02" },
  { id: 3, actor: "system", action: "BUSINESS_APPROVED", when: "2026-08-06 11:47" },
];

export const logsMockApi = {
  // ponytail: static feed; wire to superadmin.admin_audit_logs (backend already writes
  // there via logAudit()) once a GET /admin/audit-logs endpoint exists.
  getLogs: async (): Promise<AuditLogEntry[]> => {
    console.log("[mock] GET /admin/audit-logs");
    await delay(300);
    return mockLogs;
  },
};
