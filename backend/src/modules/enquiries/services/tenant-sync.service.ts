// Mirrors a distribution into the matched business's own tenant schema, so the
// business portal's list is genuinely tenant-sourced (see PRD scope-revision).
// Fire-and-forget: a single business's tenant write must never fail the match.

import { masterKnex } from "../../../core/db/master-pool.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { schemaName } from "../../../core/db/knex.js";
import { createChildLogger } from "../../../shared/logger.js";
import type { Recipient } from "../shared/recipient.js";

const logger = createChildLogger("enquiry-tenant-sync");

export async function syncDistributionToTenant(
  businessId: number,
  enquiryId: string,
  distributionId: string,
): Promise<void> {
  try {
    const business = await masterKnex("businesses").where({ id: businessId }).first("schema_name");
    if (!business) {
      logger.error("Business not found for tenant sync", { businessId, enquiryId, distributionId });
      return;
    }

    const tenantDb = await getKnex(businessId, schemaName(business.schema_name));
    await insertTenantRow(tenantDb, enquiryId, distributionId);
  } catch (err) {
    logger.error("Failed to sync distribution to tenant", { businessId, enquiryId, distributionId, error: err });
  }
}

/**
 * The institution twin of syncDistributionToTenant, for the fallback distribution.
 *
 * Silently does nothing for an institution that was promoted but never claimed: it has no schema
 * yet (`schema_provisioned_at IS NULL`), so there is nowhere to mirror to. The central
 * distribution row is the durable one — the claim flow provisions the schema, and the row can be
 * mirrored then. This is why the institution's inbox must never treat "no tenant row" as "no lead".
 */
export async function syncInstitutionDistributionToTenant(
  institutionId: number,
  enquiryId: string,
  distributionId: string,
): Promise<void> {
  try {
    const institution = await masterKnex("institutions")
      .where({ id: institutionId })
      .first("schema_name", "schema_provisioned_at");
    if (!institution?.schema_provisioned_at) {
      logger.info("Institution has no tenant schema yet — fallback stays central-only", {
        institutionId,
        enquiryId,
        distributionId,
      });
      return;
    }

    // Pool key is the schema uuid, not the id: institution ids and business ids collide.
    const tenantDb = await getKnex(institution.schema_name, schemaName(institution.schema_name));
    await insertTenantRow(tenantDb, enquiryId, distributionId);
  } catch (err) {
    logger.error("Failed to sync institution distribution to tenant", {
      institutionId,
      enquiryId,
      distributionId,
      error: err,
    });
  }
}

/**
 * Seeded as 'distributed' (not the migration's generic 'new' default) because sync only ever runs
 * right after a distribution is freshly created — that is its real status at this moment, and it's
 * what GET /enquiry-distributions' ?status= filter (distributed|withdrawn|expired) filters against.
 *
 * Both tenant kinds use the table name `business_enquiries` — see the institution migration for why.
 */
async function insertTenantRow(
  tenantDb: Awaited<ReturnType<typeof getKnex>>,
  enquiryId: string,
  distributionId: string,
): Promise<void> {
  await tenantDb.raw(
    `INSERT INTO business_enquiries (enquiry_id, distribution_id, status) VALUES (?, ?, 'distributed')
     ON CONFLICT (enquiry_id) DO NOTHING`,
    [enquiryId, distributionId],
  );
}

/**
 * Mirrors a status change onto the business's own tenant row.
 *
 * NOT fire-and-forget, unlike syncDistributionToTenant above: the inbox listing
 * reads `business_enquiries.status`, so swallowing a failure here would leave the
 * business looking at a stale status — an unlock they just paid for would appear
 * not to have happened. Callers run this after their transaction commits and let it
 * throw.
 */
export async function syncStatusToTenant(
  recipient: Recipient,
  enquiryId: string,
  status: string,
): Promise<void> {
  const tenantDb = await tenantDbFor(recipient);
  await tenantDb("business_enquiries")
    .where({ enquiry_id: enquiryId })
    .update({ status, updated_at: tenantDb.fn.now() });
}

/**
 * A thread with a message in it is a conversation — so every message write moves the
 * business's own row on from 'unlocked'. Called from the unlock (whose greeting is the
 * first message) and from every message afterwards, since a row that missed the
 * transition should not stay wrong until someone notices.
 *
 * Best-effort, unlike syncStatusToTenant: the message is already durable by the time
 * this runs, and failing the send over a mirrored status would be the worse outcome —
 * the next message repairs it.
 *
 * Terminal states are left alone: 'converted' and 'closed' are outcomes the business
 * chose, and a stray message must not walk one of them backwards.
 */
export async function markInConversation(recipient: Recipient, enquiryId: string): Promise<void> {
  try {
    const tenantDb = await tenantDbFor(recipient);
    await tenantDb("business_enquiries")
      .where({ enquiry_id: enquiryId })
      .whereNotIn("status", ["converted", "closed"])
      .update({ status: "in_conversation", updated_at: tenantDb.fn.now() });
  } catch (err) {
    logger.error("Failed to mark tenant enquiry in_conversation", { recipient, enquiryId, error: err });
  }
}

/**
 * The recipient's own schema. An unclaimed institution has none — it is not enterable, so
 * nothing can be reading a status from it either, and skipping is the honest answer rather
 * than provisioning a schema as a side effect of a status change.
 */
async function tenantDbFor(recipient: Recipient) {
  if (recipient.kind === "institution") {
    const institution = await masterKnex("institutions")
      .where({ id: recipient.id })
      .first("schema_name", "schema_provisioned_at");
    if (!institution?.schema_provisioned_at) {
      throw new Error(`Institution ${recipient.id} has no tenant schema yet`);
    }
    // Pool key is the schema uuid — institution ids collide with business ids.
    return getKnex(institution.schema_name, schemaName(institution.schema_name));
  }

  const business = await masterKnex("businesses").where({ id: recipient.id }).first("schema_name");
  if (!business) throw new Error(`Business ${recipient.id} not found for tenant status sync`);
  return getKnex(recipient.id, schemaName(business.schema_name));
}

/**
 * Mirrors every enquiry already sent to this institution into the schema it just got.
 *
 * The fallback distributes to unclaimed institutions on purpose — the notification is what asks
 * someone to claim the account — so by the time a schema exists there can be leads waiting that
 * were never mirrored. Without this the institution claims, signs in, and finds an empty
 * Enquiries tab holding exactly the enquiry that brought them here.
 *
 * Statuses come from the central row rather than being reset to 'distributed': nothing else could
 * have moved them (the institution had no way in), but copying what is there costs nothing and
 * cannot be wrong.
 */
export async function backfillInstitutionDistributions(institutionId: number): Promise<void> {
  try {
    const rows = await masterKnex("enquiry_distributions")
      .where({ institution_id: institutionId })
      .whereNull("deleted_at")
      .select("id", "enquiry_id", "status");
    if (rows.length === 0) return;

    const tenantDb = await tenantDbFor({ kind: "institution", id: institutionId });
    for (const row of rows) {
      await tenantDb.raw(
        `INSERT INTO business_enquiries (enquiry_id, distribution_id, status) VALUES (?, ?, ?)
         ON CONFLICT (enquiry_id) DO NOTHING`,
        [row.enquiry_id, row.id, row.status],
      );
    }
    logger.info("Backfilled institution enquiries on claim", { institutionId, count: rows.length });
  } catch (err) {
    logger.error("Failed to backfill institution enquiries on claim", { institutionId, error: err });
  }
}
