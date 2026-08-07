export type AuditLogEntry = {
  id: number | string;
  actor: string;
  action: string;
  when: string;
};
