// business_invitation_index — globalyapp-side read model over the per-tenant `agent_invitations` table.
//
// The tenant row is the system of record; this is derived. Tenants are separate Knex instances (their own
// searchPath and pool), so a tenant write and an index write can never share a transaction — every write
// here is therefore idempotent so the dual write can be retried and the reconciler can replay it freely.

import { createHash } from "node:crypto";
import { masterKnex } from "../../../core/db/master-pool.js";

export interface InvitationIndexRow {
  id: string;
  business_id: number;
  tenant_invitation_id: string;
  invitee_email_normalized: string;
  platform_user_id: number | null;
  role: string;
  position: string | null;
  token_hash: string | null;
  status: string;
  expires_at: Date;
  invited_by_platform_user_id: number | null;
  created_at: Date;
  responded_at: Date | null;
  synced_at: Date | null;
  sync_error: string | null;
  deleted_at: Date | null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type UpsertIndexInput = {
  business_id: number;
  tenant_invitation_id: string;
  invitee_email: string;
  platform_user_id?: number | null;
  role: string;
  position?: string | null;
  token_hash?: string | null;
  status?: string;
  expires_at: Date;
  invited_by_platform_user_id?: number | null;
  created_at?: Date;
  responded_at?: Date | null;
};

/** Idempotent — safe to call from the dual write and from either reconciler pass. */
export async function upsert(input: UpsertIndexInput) {
  const row = {
    business_id: input.business_id,
    tenant_invitation_id: input.tenant_invitation_id,
    invitee_email_normalized: normalizeEmail(input.invitee_email),
    platform_user_id: input.platform_user_id ?? null,
    role: input.role,
    position: input.position ?? null,
    token_hash: input.token_hash ?? null,
    status: input.status ?? "pending",
    expires_at: input.expires_at,
    invited_by_platform_user_id: input.invited_by_platform_user_id ?? null,
    responded_at: input.responded_at ?? null,
    synced_at: masterKnex.fn.now(),
    sync_error: null,
    ...(input.created_at ? { created_at: input.created_at } : {}),
  };

  const [saved] = await masterKnex("business_invitation_index")
    .insert(row)
    .onConflict("tenant_invitation_id")
    .merge({
      invitee_email_normalized: row.invitee_email_normalized,
      platform_user_id: row.platform_user_id,
      role: row.role,
      position: row.position,
      status: row.status,
      expires_at: row.expires_at,
      responded_at: row.responded_at,
      synced_at: row.synced_at,
      sync_error: null,
    })
    .returning("*");
  return saved as InvitationIndexRow;
}

export async function findById(id: string) {
  return masterKnex("business_invitation_index")
    .where({ id })
    .whereNull("deleted_at")
    .first() as Promise<InvitationIndexRow | undefined>;
}

export async function findByTenantInvitationId(tenantInvitationId: string) {
  return masterKnex("business_invitation_index")
    .where({ tenant_invitation_id: tenantInvitationId })
    .whereNull("deleted_at")
    .first() as Promise<InvitationIndexRow | undefined>;
}

/**
 * Pending, unexpired invitations addressed to this caller — by account link OR by their own email.
 * The email always comes from the caller's own platform_users row; a client-supplied one is never used.
 */
export async function listPendingForUser(platformUserId: number, ownEmail: string) {
  return masterKnex("business_invitation_index as bii")
    .leftJoin("businesses as b", "b.id", "bii.business_id")
    .where("bii.status", "pending")
    .whereNull("bii.deleted_at")
    .where("bii.expires_at", ">", masterKnex.fn.now())
    .where((qb) =>
      qb
        .where("bii.platform_user_id", platformUserId)
        .orWhere("bii.invitee_email_normalized", normalizeEmail(ownEmail)),
    )
    .select(
      "bii.id",
      "bii.business_id",
      "bii.tenant_invitation_id",
      "bii.role",
      "bii.position",
      "bii.expires_at",
      "b.business_name",
      "b.logo_url",
      "b.schema_name as org_id",
    )
    .orderBy("bii.created_at", "desc")
    .limit(20) as Promise<Record<string, unknown>[]>;
}

export async function markResponded(id: string, status: "accepted" | "declined", platformUserId?: number) {
  await masterKnex("business_invitation_index")
    .where({ id })
    .update({
      status,
      responded_at: masterKnex.fn.now(),
      synced_at: masterKnex.fn.now(),
      sync_error: null,
      ...(platformUserId ? { platform_user_id: platformUserId } : {}),
    });
}

export async function markSyncError(id: string, message: string) {
  await masterKnex("business_invitation_index").where({ id }).update({ sync_error: message.slice(0, 500) });
}

export async function markExpired(ids: string[]) {
  if (!ids.length) return;
  await masterKnex("business_invitation_index")
    .whereIn("id", ids)
    .where({ status: "pending" })
    .update({ status: "expired", synced_at: masterKnex.fn.now() });
}

/** Rows the flagged reconciliation sweep should look at. */
export async function listFlagged(limit = 200) {
  return masterKnex("business_invitation_index")
    .whereNull("deleted_at")
    .where((qb) =>
      qb
        .whereNull("synced_at")
        .orWhereNotNull("sync_error")
        .orWhere((inner) => inner.where({ status: "pending" }).where("expires_at", "<", masterKnex.fn.now())),
    )
    .limit(limit) as Promise<InvitationIndexRow[]>;
}

/**
 * Non-terminal rows for state reverification. A row whose index write failed keeps a valid synced_at and
 * a future expires_at, so it carries no flag and listFlagged() cannot find it — only re-reading the tenant
 * row proves whether it is still really pending.
 */
export async function listNonTerminal(limit = 500) {
  return masterKnex("business_invitation_index")
    .whereNull("deleted_at")
    .whereIn("status", ["pending", "expired"])
    .orderBy("created_at", "asc")
    .limit(limit) as Promise<InvitationIndexRow[]>;
}

/** Tenant invitation ids already indexed for a business — the left side of the full ID audit's diff. */
export async function listIndexedTenantIds(businessId: number): Promise<Set<string>> {
  const rows = await masterKnex("business_invitation_index")
    .where({ business_id: businessId })
    .select("tenant_invitation_id");
  return new Set(rows.map((r: { tenant_invitation_id: string }) => r.tenant_invitation_id));
}

/** Watermark for the incremental pass: the newest tenant invitation already indexed for this business. */
export async function latestIndexedCreatedAt(businessId: number): Promise<Date | null> {
  const row = await masterKnex("business_invitation_index")
    .where({ business_id: businessId })
    .max("created_at as newest")
    .first();
  return (row?.newest as Date | undefined) ?? null;
}
