// Immigration repository — visas, MARA agents.

import { masterKnex } from "../../../../core/db/master-pool.js";

const S = "superadmin";

export async function listVisas(opts: { status?: string; limit: number }) {
  const query = masterKnex(`${S}.extraction_visas`).orderBy("created_at", "desc").limit(opts.limit);
  if (opts.status) query.where("status", opts.status);
  return query;
}

export async function listMaraAgents(opts: { status?: string; limit: number }) {
  const query = masterKnex(`${S}.extraction_mara_agents`).orderBy("created_at", "desc").limit(opts.limit);
  if (opts.status) query.where("status", opts.status);
  return query;
}

export async function updateVisaStatus(id: string, status: string) {
  const count = await masterKnex(`${S}.extraction_visas`)
    .where({ id })
    .update({ status, updated_at: masterKnex.fn.now() });
  return count > 0;
}

export async function updateMaraStatus(id: string, status: string) {
  const count = await masterKnex(`${S}.extraction_mara_agents`)
    .where({ id })
    .update({ status, updated_at: masterKnex.fn.now() });
  return count > 0;
}

// ponytail: promote_visa_to_service and promote_mara_to_business are SQL RPCs
// that don't exist in this repo. Stubs until the SQL functions are written.

export async function promoteVisa(id: string, departmentBusinessId: string) {
  // Would call: SELECT promote_visa_to_service(_extraction_id := id, _department_business_id := departmentBusinessId)
  // For now, just mark as promoted
  await masterKnex(`${S}.extraction_visas`)
    .where({ id })
    .update({ status: "promoted", updated_at: masterKnex.fn.now() });
  return id; // placeholder — real function returns new service id
}

export async function promoteMara(id: string) {
  // Would call: SELECT promote_mara_to_business(_staged_id := id)
  // For now, just mark as promoted
  await masterKnex(`${S}.extraction_mara_agents`)
    .where({ id })
    .update({ status: "promoted", updated_at: masterKnex.fn.now() });
  return id; // placeholder — real function returns new business id
}
