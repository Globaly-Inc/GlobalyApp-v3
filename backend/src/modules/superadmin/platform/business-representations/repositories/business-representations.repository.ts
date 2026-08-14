// Repository for the business_representations table — lives in the master/superadmin schema.

import { masterKnex } from "../../../../../core/db/master-pool.js";
import { getKnex } from "../../../../../core/db/pool-manager.js";
import type { RelationInput, RelationPatch } from "../schemas/business-representations.schema.js";

const now = () => masterKnex.fn.now();

const RELATION_COLUMNS = [
  "uuid as id", "status", "relation_type", "created_at",
  "business_id", "partner_business_id", "partner_business_name as business_name", "partner_business_logo_url as logo_url",
  "country_ids", "valid_from", "valid_until", "notes",
];

export async function listRelations(businessId: number, limit: number, offset: number) {
  const base = () =>
    masterKnex("business_representations as r")
      .join("businesses as b", "b.id", "r.partner_business_id")
      .where("r.business_id", businessId)
      .whereNull("r.deleted_at");

  const [{ count }] = await base().count<{ count: string }[]>("r.id as count");
  const rows = await base()
    .select(
      "r.uuid as id", "r.status", "r.relation_type", "r.created_at",
      "r.country_ids", "r.valid_from", "r.valid_until", "r.notes",
      "b.id as business_id", "r.partner_business_name as business_name", "r.partner_business_logo_url as logo_url", "b.business_type",
    )
    .orderBy("r.created_at", "desc")
    .limit(limit)
    .offset(offset);
  return { rows, total: Number(count) };
}

export async function createRelation(
  businessId: number,
  data: Pick<RelationInput, "partner_business_id" | "relation_type" | "country_ids" | "valid_from" | "valid_until" | "notes">,
  partnerBusinessName: string,
  partnerBusinessLogoUrl: string | null,
  ignoreDuplicate = false,
) {
  const query = masterKnex("business_representations")
    .insert({
      business_id: businessId,
      partner_business_id: data.partner_business_id,
      partner_business_name: partnerBusinessName,
      partner_business_logo_url: partnerBusinessLogoUrl,
      relation_type: data.relation_type,
      country_ids: data.country_ids,
      valid_from: data.valid_from ?? null,
      valid_until: data.valid_until ?? null,
      notes: data.notes ?? null,
    })
    .returning(RELATION_COLUMNS);
  if (ignoreDuplicate) query.onConflict(["business_id", "partner_business_id"]).ignore();
  const [row] = await query;
  return row;
}

export async function updateRelation(businessId: number, relationId: string, data: RelationPatch) {
  const [row] = await masterKnex("business_representations")
    .where({ uuid: relationId, business_id: businessId })
    .whereNull("deleted_at")
    .update({ ...data, updated_at: now() })
    .returning(RELATION_COLUMNS);
  return row;
}

// Branches that are themselves separate registered businesses (business_branches lives in
// the parent's own tenant schema; linked_business_id is an app-level FK to master businesses.id).
export async function listLinkedBranchBusinessIds(businessId: number, schemaName: string): Promise<number[]> {
  const db = await getKnex(businessId, schemaName);
  const rows = await db("business_branches").whereNotNull("linked_business_id").whereNull("deleted_at").select("linked_business_id");
  return rows.map((r) => r.linked_business_id as number);
}

export async function deleteRelation(businessId: number, relationId: string) {
  return masterKnex("business_representations").where({ uuid: relationId, business_id: businessId }).update({ deleted_at: now() });
}
