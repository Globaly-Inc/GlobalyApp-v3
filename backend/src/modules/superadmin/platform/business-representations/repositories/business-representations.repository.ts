import { masterKnex } from "../../../../../core/db/master-pool.js";
import { getKnex } from "../../../../../core/db/pool-manager.js";
import type { RelationInput, RelationPatch } from "../schemas/business-representations.schema.js";

const now = () => masterKnex.fn.now();

const RAW_COLUMNS = [
  "uuid as id", "status", "created_at", "target_id", "target_type",
  "country_ids", "valid_from", "valid_until", "notes",
];

type RawRelationRow = {
  id: string; status: string; created_at: string;
  target_id: number; target_type: "business" | "institution";
  country_ids: number[] | null; valid_from: string | null; valid_until: string | null; notes: string | null;
};

async function hydrateRelation(row: RawRelationRow) {
  const target = row.target_type === "institution"
    ? await masterKnex("institutions").where({ id: row.target_id }).first("institution_name as name", "logo_url")
    : await masterKnex("businesses").where({ id: row.target_id }).first("business_name as name", "logo_url", "business_type");
  return {
    id: row.id,
    status: row.status,
    created_at: row.created_at,
    partner_kind: row.target_type,
    partner_id: row.target_id,
    partner_name: target?.name ?? null,
    partner_logo_url: target?.logo_url ?? null,
    business_type: row.target_type === "business" ? (target?.business_type ?? null) : null,
    country_ids: row.country_ids,
    valid_from: row.valid_from,
    valid_until: row.valid_until,
    notes: row.notes,
  };
}

function targetJoins<T extends ReturnType<typeof masterKnex>>(qb: T): T {
  return qb
    .leftJoin("businesses as tb", (join) => join.on("tb.id", "r.target_id").andOnVal("r.target_type", "business"))
    .leftJoin("institutions as ti", (join) => join.on("ti.id", "r.target_id").andOnVal("r.target_type", "institution")) as T;
}

// Business's own Partners tab: rows it originates. The target shown can be a business or an institution.
export async function listRelations(businessId: number, limit: number, offset: number, search?: string) {
  const base = () => {
    const q = targetJoins(masterKnex("business_representations as r"))
      .where({ "r.originator_id": businessId, "r.originator_type": "business" })
      .whereNull("r.deleted_at");
    if (search) {
      q.where((b) => b.whereILike("tb.business_name", `%${search}%`).orWhereILike("ti.institution_name", `%${search}%`));
    }
    return q;
  };

  const [{ count }] = await base().count<{ count: string }[]>("r.id as count");
  const rows = await base()
    .select(
      "r.uuid as id", "r.status", "r.created_at",
      "r.country_ids", "r.valid_from", "r.valid_until", "r.notes",
      "r.target_type as partner_kind",
      "r.target_id as partner_id",
      masterKnex.raw("COALESCE(tb.business_name, ti.institution_name) as partner_name"),
      masterKnex.raw("COALESCE(tb.logo_url, ti.logo_url) as partner_logo_url"),
      "tb.business_type",
    )
    .orderBy("r.created_at", "desc")
    .limit(limit)
    .offset(offset);
  return { rows, total: Number(count) };
}

// Institution's own Partners tab: rows where this institution is the target. The originator is
// always a business (the consultancy being shown) — mirror-image of listRelations above.
export async function listByPartnerInstitutionId(institutionId: number, limit: number, offset: number, search?: string) {
  const base = () => {
    const q = masterKnex("business_representations as r")
      .join("businesses as b", "b.id", "r.originator_id")
      .where({ "r.target_id": institutionId, "r.target_type": "institution" })
      .whereNull("r.deleted_at");
    if (search) q.whereILike("b.business_name", `%${search}%`);
    return q;
  };

  const [{ count }] = await base().count<{ count: string }[]>("r.id as count");
  const rows = await base()
    .select(
      "r.uuid as id", "r.status", "r.created_at",
      "r.country_ids", "r.valid_from", "r.valid_until", "r.notes",
      masterKnex.raw("'business' as partner_kind"),
      "b.id as partner_id", "b.business_name as partner_name", "b.logo_url as partner_logo_url", "b.business_type",
    )
    .orderBy("r.created_at", "desc")
    .limit(limit)
    .offset(offset);
  return { rows, total: Number(count) };
}

export async function createRelation(
  businessId: number,
  data: Pick<RelationInput, "partner_business_id" | "country_ids" | "valid_from" | "valid_until" | "notes">,
  ignoreDuplicate = false,
) {
  const query = masterKnex("business_representations")
    .insert({
      originator_id: businessId,
      originator_type: "business",
      target_id: data.partner_business_id,
      target_type: "business",
      country_ids: data.country_ids,
      valid_from: data.valid_from ?? null,
      valid_until: data.valid_until ?? null,
      notes: data.notes ?? null,
    })
    .returning(RAW_COLUMNS);
  if (ignoreDuplicate) query.onConflict(["originator_id", "originator_type", "target_id", "target_type"]).ignore();
  const [row] = await query;
  return row && hydrateRelation(row);
}

// Institution-initiated "Link consultancy": the row is originated by the picked business, the
// institution is the target — inverse of createRelation's business-initiated write.
export async function createRelationForInstitution(businessId: number, institutionId: number, data: RelationPatch) {
  const [row] = await masterKnex("business_representations")
    .insert({
      originator_id: businessId,
      originator_type: "business",
      target_id: institutionId,
      target_type: "institution",
      country_ids: data.country_ids,
      valid_from: data.valid_from ?? null,
      valid_until: data.valid_until ?? null,
      notes: data.notes ?? null,
    })
    .returning(RAW_COLUMNS);
  return hydrateRelation(row);
}

export async function updateRelation(businessId: number, relationId: string, data: RelationPatch) {
  const [row] = await masterKnex("business_representations")
    .where({ uuid: relationId, originator_id: businessId, originator_type: "business" })
    .whereNull("deleted_at")
    .update({ ...data, updated_at: now() })
    .returning(RAW_COLUMNS);
  return row && hydrateRelation(row);
}

export async function updateRelationForInstitution(institutionId: number, relationId: string, data: RelationPatch) {
  const [row] = await masterKnex("business_representations")
    .where({ uuid: relationId, target_id: institutionId, target_type: "institution" })
    .whereNull("deleted_at")
    .update({ ...data, updated_at: now() })
    .returning(RAW_COLUMNS);
  return row && hydrateRelation(row);
}

// Branches that are themselves separate registered businesses (business_branches lives in
// the parent's own tenant schema; linked_business_id is an app-level FK to master businesses.id).
export async function listLinkedBranchBusinessIds(businessId: number, schemaName: string): Promise<number[]> {
  const db = await getKnex(businessId, schemaName);
  const rows = await db("business_branches").whereNotNull("linked_business_id").whereNull("deleted_at").select("linked_business_id");
  return rows.map((r) => r.linked_business_id as number);
}

export async function deleteRelation(businessId: number, relationId: string) {
  return masterKnex("business_representations")
    .where({ uuid: relationId, originator_id: businessId, originator_type: "business" })
    .update({ deleted_at: now() });
}

export async function deleteRelationForInstitution(institutionId: number, relationId: string) {
  return masterKnex("business_representations")
    .where({ uuid: relationId, target_id: institutionId, target_type: "institution" })
    .update({ deleted_at: now() });
}

export async function isActivePartner(businessId: number, institutionId: number): Promise<boolean> {
  const row = await masterKnex("business_representations")
    .where({ originator_id: businessId, originator_type: "business", target_id: institutionId, target_type: "institution" })
    .whereNull("deleted_at")
    .first("id");
  return !!row;
}
