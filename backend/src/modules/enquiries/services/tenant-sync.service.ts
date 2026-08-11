// Mirrors a distribution into the matched business's own tenant schema, so the
// business portal's list is genuinely tenant-sourced (see PRD scope-revision).
// Fire-and-forget: a single business's tenant write must never fail the match.

import { masterKnex } from "../../../core/db/master-pool.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { schemaName } from "../../../core/db/knex.js";
import { createChildLogger } from "../../../shared/logger.js";

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

    // Seeded as 'distributed' (not the migration's generic 'new' default) because
    // sync only ever runs right after a distribution is freshly created — that is
    // its real status at this moment, and it's what GET /enquiry-distributions'
    // ?status= filter (distributed|withdrawn|expired) actually filters against.
    await tenantDb.raw(
      `INSERT INTO business_enquiries (enquiry_id, distribution_id, status) VALUES (?, ?, 'distributed')
       ON CONFLICT (enquiry_id) DO NOTHING`,
      [enquiryId, distributionId],
    );
  } catch (err) {
    logger.error("Failed to sync distribution to tenant", { businessId, enquiryId, distributionId, error: err });
  }
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
  businessId: number,
  enquiryId: string,
  status: string,
): Promise<void> {
  const business = await masterKnex("businesses").where({ id: businessId }).first("schema_name");
  if (!business) throw new Error(`Business ${businessId} not found for tenant status sync`);

  const tenantDb = await getKnex(businessId, schemaName(business.schema_name));
  await tenantDb("business_enquiries")
    .where({ enquiry_id: enquiryId })
    .update({ status, updated_at: tenantDb.fn.now() });
}
