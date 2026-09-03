// Repository for the service child+junction family (tenant-scoped, one row set per
// business_services.uuid). Each table has the identical list/create/update/remove shape,
// so one generic builder covers all five plain child tables; accreditations (a pure
// junction, no own fields) gets its own pair.

import { getKnex } from "../../../../../core/db/pool-manager.js";

function makeChildRepo(table: string) {
  return {
    list: async (businessId: number, schemaName: string, serviceId: string) => {
      const db = await getKnex(businessId, schemaName);
      return db(table).where({ service_id: serviceId }).orderBy("created_at", "asc");
    },
    create: async (businessId: number, schemaName: string, serviceId: string, data: Record<string, unknown>) => {
      const db = await getKnex(businessId, schemaName);
      const [row] = await db(table).insert({ ...data, service_id: serviceId }).returning("*");
      return row;
    },
    update: async (businessId: number, schemaName: string, serviceId: string, id: number, data: Record<string, unknown>) => {
      const db = await getKnex(businessId, schemaName);
      const [row] = await db(table).where({ id, service_id: serviceId }).update({ ...data, updated_at: db.fn.now() }).returning("*");
      return row;
    },
    remove: async (businessId: number, schemaName: string, serviceId: string, id: number) => {
      const db = await getKnex(businessId, schemaName);
      return db(table).where({ id, service_id: serviceId }).delete();
    },
  };
}

export const feesRepo = makeChildRepo("service_fees");
export const intakesRepo = makeChildRepo("service_intakes");
export const eligibilityRepo = makeChildRepo("service_eligibility_requirements");
export const studyOptionsRepo = makeChildRepo("service_study_options");
export const studyUnitsRepo = makeChildRepo("service_study_units");

export async function listAccreditations(businessId: number, schemaName: string, serviceId: string) {
  const db = await getKnex(businessId, schemaName);
  return db("service_accreditations").where({ service_id: serviceId }).select("id", "accreditation_id");
}

export async function linkAccreditation(businessId: number, schemaName: string, serviceId: string, accreditationId: number) {
  const db = await getKnex(businessId, schemaName);
  const [row] = await db("service_accreditations")
    .insert({ service_id: serviceId, accreditation_id: accreditationId })
    .onConflict(["service_id", "accreditation_id"])
    .merge()
    .returning("*");
  return row;
}

export async function unlinkAccreditation(businessId: number, schemaName: string, serviceId: string, id: number) {
  const db = await getKnex(businessId, schemaName);
  return db("service_accreditations").where({ id, service_id: serviceId }).delete();
}
