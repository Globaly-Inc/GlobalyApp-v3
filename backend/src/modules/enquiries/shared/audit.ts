// Audit log helper — writes to globalyapp.audit_logs.
// No existing helper targets this table (only superadmin.admin_audit_logs has one, at
// data-extraction/shared/audit.ts) — this is the smallest helper matching that table's
// shape. Later phases (distributions, conversations) should import and reuse this, not
// write their own.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";

export async function logEnquiryAudit(
  platformUserId: number | null,
  action: string,
  opts?: {
    entityType?: string;
    entityId?: string;
    orgId?: string | null;
    details?: Record<string, unknown>;
    trx?: Knex.Transaction;
  },
) {
  const db = opts?.trx ?? masterKnex;
  await db("audit_logs").insert({
    platform_user_id: platformUserId,
    action,
    entity_type: opts?.entityType ?? null,
    entity_id: opts?.entityId ?? null,
    org_id: opts?.orgId ?? null,
    details: JSON.stringify(opts?.details ?? {}),
  });
}

// Entity types written by logEnquiryAudit calls across this module (enquiries/
// distributions/matching/conversations/representations services + expiry worker).
export const ENQUIRY_AUDIT_ENTITY_TYPES = ["enquiry", "distribution", "conversation", "representation"] as const;

export async function listEnquiryAudit(opts: { limit: number; offset: number; entityType?: string }) {
  const q = masterKnex("audit_logs")
    .whereIn("entity_type", ENQUIRY_AUDIT_ENTITY_TYPES)
    .orderBy("created_at", "desc")
    .limit(opts.limit)
    .offset(opts.offset);
  if (opts.entityType) q.where("entity_type", opts.entityType);
  return q;
}

export async function countEnquiryAudit(opts: { entityType?: string }) {
  const q = masterKnex("audit_logs").whereIn("entity_type", ENQUIRY_AUDIT_ENTITY_TYPES);
  if (opts.entityType) q.where("entity_type", opts.entityType);
  const [{ count }] = await q.count("id as count");
  return Number(count);
}
