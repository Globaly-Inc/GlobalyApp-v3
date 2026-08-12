/**
 * Convergence job for the business_invitation_index read model.
 *
 * The tenant `agent_invitations` row is the source of truth; the index is derived and written by a separate
 * connection, so the two can drift. Three passes, in order, each built from idempotent writes so running
 * them twice — or interleaved with live traffic — changes nothing:
 *
 *   1. tenant → index, incremental      — cheap catch-up for recent invitations
 *   2. tenant → index, full ID audit    — guarantees NO invitation is permanently missing.
 *                                         Pass 1's watermark cannot do this: if an older invitation fails
 *                                         to index while a newer one succeeds, the watermark advances past
 *                                         the failed one and every later incremental run skips it forever.
 *   3. index → tenant, state verify     — guarantees no indexed invitation is permanently WRONG. A failed
 *                                         status write leaves a valid synced_at and a future expires_at, so
 *                                         it carries no flag and its id exists on both sides; only
 *                                         re-reading the tenant row reveals it.
 *
 *   npm run job:reconcile-invitations           (passes 1 + 3-flagged)
 *   npm run job:reconcile-invitations -- --full (all three, full state reverification)
 */

import { masterKnex } from "../../../core/db/master-pool.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { schemaName } from "../../../core/db/knex.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as repo from "../repositories/agents.repository.js";
import * as indexRepo from "../../platform-users/repositories/business-invitations.repository.js";
import * as platformUserRepo from "../../platform-users/repositories/platform-users.repository.js";

const logger = createChildLogger("reconcile-invitations");

type Stats = { created: number; repaired: number; expired: number; membershipsRepaired: number; errors: number };

const INDEX_STATUS: Record<string, string> = { pending: "pending", accepted: "accepted", declined: "declined" };

async function businessesWithTenants() {
  return masterKnex("businesses")
    .whereNotNull("schema_name")
    .whereNull("deleted_at")
    .select("id", "schema_name", "business_name") as Promise<
    { id: number; schema_name: string; business_name: string }[]
  >;
}

/** Write one tenant invitation into the index, in whatever state the tenant says it is. */
async function indexOne(
  businessId: number,
  invitation: Awaited<ReturnType<typeof repo.findInvitationById>>,
  stats: Stats,
  kind: "created" | "repaired",
) {
  if (!invitation) return;
  const details = (invitation.user_details ?? {}) as Record<string, string>;
  const existingUser = await platformUserRepo.findByEmail(invitation.email).catch(() => undefined);
  const status = INDEX_STATUS[invitation.status] ?? invitation.status;

  await indexRepo.upsert({
    business_id: businessId,
    tenant_invitation_id: invitation.id,
    invitee_email: invitation.email,
    platform_user_id: existingUser?.id ?? null,
    role: details.role ?? "member",
    // The tenant table stores the plaintext token today, which is what makes recovery possible.
    // ponytail: hashing it tenant-side too is a follow-up; it would make this pass unable to rebuild token_hash.
    token_hash: invitation.invite_token ? indexRepo.hashToken(invitation.invite_token) : null,
    status,
    expires_at: invitation.expired_at,
    created_at: invitation.created_at,
    responded_at: status === "pending" ? null : new Date(),
  });
  stats[kind]++;
}

/** Pass 1 — recent invitations only. */
async function incrementalPass(stats: Stats) {
  for (const business of await businessesWithTenants()) {
    try {
      const db = await getKnex(business.id, schemaName(business.schema_name));
      const since = await indexRepo.latestIndexedCreatedAt(business.id);
      const invitations = await repo.listInvitationsSince(db, since);
      const indexed = await indexRepo.listIndexedTenantIds(business.id);
      for (const inv of invitations) {
        await indexOne(business.id, inv, stats, indexed.has(inv.id) ? "repaired" : "created");
      }
    } catch (err) {
      stats.errors++;
      logger.warn("Incremental pass failed for business", {
        business: business.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/** Pass 2 — full id set difference. Existence guarantee. */
async function fullIdAuditPass(stats: Stats) {
  for (const business of await businessesWithTenants()) {
    try {
      const db = await getKnex(business.id, schemaName(business.schema_name));
      const indexed = await indexRepo.listIndexedTenantIds(business.id);
      let afterId: string | null = null;

      for (;;) {
        const page = await repo.listInvitationIdsPaged(db, afterId);
        if (!page.length) break;
        afterId = page[page.length - 1].id;

        const missing = page.map((r) => r.id).filter((id) => !indexed.has(id));
        if (missing.length) {
          const rows = await repo.findInvitationsByIds(db, missing);
          for (const inv of rows) await indexOne(business.id, inv, stats, "created");
        }
      }
    } catch (err) {
      stats.errors++;
      logger.warn("Full ID audit failed for business", {
        business: business.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/** Pass 3 — verify state, not just existence. Correctness guarantee. */
async function stateVerifyPass(stats: Stats, full: boolean) {
  const rows = full ? await indexRepo.listNonTerminal() : await indexRepo.listFlagged();

  for (const row of rows) {
    try {
      const business = await masterKnex("businesses").where({ id: row.business_id }).first();
      if (!business?.schema_name) continue;
      const db = await getKnex(Number(row.business_id), schemaName(business.schema_name));
      const tenant = await repo.findInvitationById(db, row.tenant_invitation_id);

      if (!tenant) {
        // Tenant row gone — the index must not keep offering it.
        await indexRepo.markExpired([row.id]);
        stats.repaired++;
        continue;
      }

      const tenantStatus = INDEX_STATUS[tenant.status] ?? tenant.status;

      if (tenantStatus !== row.status) {
        // Converge to the tenant value — this is the silent-drift repair.
        if (tenantStatus === "accepted" || tenantStatus === "declined") {
          const user = await platformUserRepo.findByEmail(tenant.email).catch(() => undefined);
          await indexRepo.markResponded(row.id, tenantStatus, tenantStatus === "accepted" ? user?.id : undefined);
        } else {
          await indexOne(Number(row.business_id), tenant, stats, "repaired");
          continue;
        }
        stats.repaired++;
      }

      // An accepted invitation must have its master-side membership. Idempotent on the existing
      // (platform_user_id, business_id) unique constraint.
      if (tenantStatus === "accepted") {
        const user = await platformUserRepo.findByEmail(tenant.email).catch(() => undefined);
        if (user) {
          const details = (tenant.user_details ?? {}) as Record<string, string>;
          const exists = await masterKnex("user_business_index")
            .where({ platform_user_id: user.id, business_id: row.business_id })
            .whereNull("deleted_at")
            .first();
          if (!exists) {
            await platformUserRepo.insertUserBusinessIndex({
              platform_user_id: user.id,
              business_id: Number(row.business_id),
              role: details.role ?? "member",
              is_owner: false,
            });
            stats.membershipsRepaired++;
          }
        }
      }

      if (tenantStatus === "pending" && new Date() > tenant.expired_at && row.status === "pending") {
        await indexRepo.markExpired([row.id]);
        stats.expired++;
      }
    } catch (err) {
      stats.errors++;
      await indexRepo
        .markSyncError(row.id, err instanceof Error ? err.message : String(err))
        .catch(() => undefined);
    }
  }
}

export async function reconcileInvitations(options: { full?: boolean } = {}): Promise<Stats> {
  const stats: Stats = { created: 0, repaired: 0, expired: 0, membershipsRepaired: 0, errors: 0 };
  await incrementalPass(stats);
  if (options.full) await fullIdAuditPass(stats);
  await stateVerifyPass(stats, !!options.full);
  logger.info("Invitation reconciliation complete", { ...stats, full: !!options.full });
  return stats;
}

// Direct invocation: npm run job:reconcile-invitations [-- --full]
if (process.argv[1]?.includes("reconcile-invitations")) {
  reconcileInvitations({ full: process.argv.includes("--full") })
    .then(async (stats) => {
      console.log("reconcile-invitations:", stats);
      await masterKnex.destroy();
    })
    .catch(async (err) => {
      console.error("reconcile-invitations failed:", err);
      await masterKnex.destroy();
      process.exit(1);
    });
}
