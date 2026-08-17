// Query/param validation for the admin audit-log viewer.

import { z } from "zod";
import { PaginationSchema } from "../../../../shared/pagination.js";

/** The two audit tables that exist in V3, exposed under one normalised feed. */
export const AUDIT_SOURCES = ["admin", "platform"] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];

export const AuditLogQuerySchema = PaginationSchema.extend({
  source: z.enum(AUDIT_SOURCES).optional(),
  /** platform_users.id — the actor, in both tables. */
  actor_id: z.coerce.number().int().positive().optional(),
  action: z.string().min(1).max(200).optional(),
  entity_type: z.string().min(1).max(200).optional(),
  /** Inclusive bounds on created_at. Accepts a date ("2026-01-01") or a full ISO timestamp. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const AuditLogParamsSchema = z.object({
  id: z.string().uuid(),
});

export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
export type AuditLogParams = z.infer<typeof AuditLogParamsSchema>;
