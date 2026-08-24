// Repository for agent ↔ institution representation requests (master schema table
// `agent_institution_representations`).

import { masterKnex } from "../../../core/db/master-pool.js";

const TABLE = "agent_institution_representations";
const now = () => masterKnex.fn.now();

const ROW_COLUMNS = [
  "r.uuid as id", "r.agent_id", "r.institution_id", "r.status", "r.initiated_by",
  "r.regions", "r.notes", "r.responded_at", "r.created_at",
  "agent.id as agent_business_id", "agent.business_name as agent_name", "agent.logo_url as agent_logo_url", "agent.city as agent_city",
  "inst.id as institution_business_id", "inst.business_name as institution_name", "inst.logo_url as institution_logo_url", "inst.city as institution_city",
];

function baseQuery() {
  return masterKnex(`${TABLE} as r`)
    .join("businesses as agent", "agent.id", "r.agent_id")
    .join("businesses as inst", "inst.id", "r.institution_id")
    .whereNull("r.deleted_at");
}

export async function listForBusiness(businessId: number) {
  return baseQuery()
    .where((qb) => qb.where("r.agent_id", businessId).orWhere("r.institution_id", businessId))
    .select(ROW_COLUMNS)
    .orderBy("r.created_at", "desc");
}

export async function listPartnerBusinessIds(businessId: number): Promise<number[]> {
  const rows = await masterKnex(TABLE)
    .where((qb) => qb.where("agent_id", businessId).orWhere("institution_id", businessId))
    .whereNull("deleted_at")
    .select("agent_id", "institution_id");
  return rows.map((r) => (r.agent_id === businessId ? r.institution_id : r.agent_id));
}

export async function findById(businessId: number, uuid: string) {
  return baseQuery()
    .where("r.uuid", uuid)
    .where((qb) => qb.where("r.agent_id", businessId).orWhere("r.institution_id", businessId))
    .select(ROW_COLUMNS)
    .first();
}

export async function create(data: {
  agent_id: number; institution_id: number; initiated_by: number; regions: string[] | null; notes: string | null;
}) {
  const [{ uuid }] = await masterKnex(TABLE)
    .insert({ ...data, status: "pending" })
    .returning("uuid");
  return findById(data.agent_id, uuid);
}

export async function updateStatus(institutionId: number, uuid: string, respondedBy: number, status: "active" | "rejected") {
  await masterKnex(TABLE)
    .where({ uuid, institution_id: institutionId, status: "pending" })
    .whereNull("deleted_at")
    .update({ status, responded_by: respondedBy, responded_at: now(), updated_at: now() });
  return findById(institutionId, uuid);
}

/** Published businesses of the opposite type, excluding the caller and any existing partner. */
export async function searchTargets(targetType: string, excludeBusinessIds: number[], search: string | undefined, limit: number) {
  const q = masterKnex("businesses")
    .where({ business_type: targetType, is_published: true })
    .whereNull("deleted_at")
    .whereNotIn("id", excludeBusinessIds.length ? excludeBusinessIds : [-1])
    .select("id", "business_name", "logo_url", "city")
    .orderBy("business_name")
    .limit(limit);
  if (search) q.whereILike("business_name", `%${search}%`);
  return q;
}
