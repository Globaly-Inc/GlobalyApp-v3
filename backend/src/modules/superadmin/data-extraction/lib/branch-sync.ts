import { masterKnex } from "../../../../core/db/master-pool.js";
import { getKnex } from "../../../../core/db/pool-manager.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { seedBranchesFromCampuses } from "../../platform/business-branches/repositories/business-branches.repository.js";

const logger = createChildLogger("branch-sync");

export async function seedBranchesFromJob(orgId: number, schemaName: string, jobId: string): Promise<void> {
  const campuses = await masterKnex("superadmin.extraction_campuses")
    .where({ job_id: jobId })
    .select("id", "name", "country", "state", "city", "address", "phone", "email");
  if (campuses.length === 0) return;

  await seedBranchesFromCampuses(orgId, schemaName, campuses);
  logger.info("Seeded branches from extraction campuses", { jobId, orgId, count: campuses.length });
}

async function findClaimedOrgForJob(jobId: string): Promise<{ id: number; schema_name: string } | null> {
  const institution = await masterKnex("institutions")
    .where({ source_job_id: jobId }).whereNotNull("schema_provisioned_at").first("id", "schema_name");
  if (institution) return { id: institution.id, schema_name: institution.schema_name };

  const business = await masterKnex("businesses")
    .where({ source_job_id: jobId }).whereNotNull("schema_provisioned_at").first("id", "schema_name");
  if (business) return { id: Number(business.id), schema_name: business.schema_name };

  return null;
}

export async function findCampusJobId(campusId: string): Promise<string | undefined> {
  const row = await masterKnex("superadmin.extraction_campuses").where({ id: campusId }).first("job_id");
  return row?.job_id;
}

export async function syncBranchFromCampus(campusId: string): Promise<void> {
  const campus = await masterKnex("superadmin.extraction_campuses").where({ id: campusId }).first();
  if (!campus) return;

  const org = await findClaimedOrgForJob(campus.job_id);
  if (!org) return;

  const db = await getKnex(org.id, org.schema_name);
  const name = campus.name ?? "Unnamed campus";
  await db.raw(
    `insert into business_branches (uuid, name, country, state, city, address, phone, email)
     values (?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (uuid) do update set
       name = excluded.name, country = excluded.country, state = excluded.state,
       city = excluded.city, address = excluded.address, phone = excluded.phone, email = excluded.email,
       updated_at = business_branches.created_at
     where business_branches.updated_at = business_branches.created_at`,
    [campusId, name, campus.country, campus.state, campus.city, campus.address, campus.phone, campus.email],
  );
}

export async function syncBranchDeletion(jobId: string, campusId: string): Promise<void> {
  const org = await findClaimedOrgForJob(jobId);
  if (!org) return;

  const db = await getKnex(org.id, org.schema_name);
  await db("business_branches")
    .where({ uuid: campusId })
    .whereRaw("updated_at = created_at")
    .update({ deleted_at: db.fn.now() });
}
