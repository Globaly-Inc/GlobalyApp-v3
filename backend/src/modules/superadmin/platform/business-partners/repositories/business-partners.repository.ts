// Repository for the business_partners table (agency/consultancy links). Distinct from
// business_representations — this links a business (e.g. an institution) with an
// agency/consultancy business. Lives in the business's own tenant schema (mirrors
// branches/services/contacts); the tenant connection's search_path also covers
// public.businesses for the join.

import { getKnex } from "../../../../../core/db/pool-manager.js";

const PARTNER_COLUMNS = ["p.uuid as id", "p.status", "p.requested_at", "p.created_at", "b.id as business_id", "b.business_name", "b.logo_url", "b.business_type"];

function partnerWithBusiness(db: Awaited<ReturnType<typeof getKnex>>) {
  return db("business_partners as p")
    .join("businesses as b", "b.id", "p.partner_business_id")
    .whereNull("p.deleted_at")
    .select(PARTNER_COLUMNS);
}

export async function listBusinessPartners(businessId: number, schemaName: string) {
  const db = await getKnex(businessId, schemaName);
  return partnerWithBusiness(db);
}

export async function createBusinessPartner(businessId: number, schemaName: string, partnerBusinessId: number) {
  const db = await getKnex(businessId, schemaName);
  const [{ uuid: id }] = await db("business_partners").insert({ partner_business_id: partnerBusinessId }).returning("uuid");
  return partnerWithBusiness(db).where("p.uuid", id).first();
}

export async function updateBusinessPartnerStatus(businessId: number, schemaName: string, partnerId: string, status: string) {
  const db = await getKnex(businessId, schemaName);
  await db("business_partners").where({ uuid: partnerId }).update({ status, updated_at: db.fn.now() });
  return partnerWithBusiness(db).where("p.uuid", partnerId).first();
}

export async function deleteBusinessPartner(businessId: number, schemaName: string, partnerId: string) {
  const db = await getKnex(businessId, schemaName);
  return db("business_partners").where({ uuid: partnerId }).update({ deleted_at: db.fn.now() });
}
