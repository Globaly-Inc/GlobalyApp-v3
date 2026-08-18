// Immigration repository — visa / MARA staging reads and the two promote paths.
//
// PROMOTE IS TRANSACTIONAL, for the same reason promote.repository.ts is: staging
// (superadmin.*), the master catalog rows (public.*) and the tenant service
// ("<uuid>".business_services) all live in ONE database, so a single masterKnex
// transaction with schema-qualified writes covers the whole promote. A failure
// anywhere rolls everything back — the catalog_services projection included, since
// it is trigger-maintained and commits with the write. Nothing half-promoted is
// ever visible.
//
// PROMOTE IS IDEMPOTENT. Every promoted row carries `extraction_source_id` and is
// written with INSERT .. ON CONFLICT .. MERGE on it, exactly like the course
// promote path (business/20260817_001_catalog_extraction_keys.ts). Promoting the
// same staged row twice updates in place and leaves exactly one live row.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { provisionBusinessSchema } from "../../../../core/business/provisioner.js";
import { BadRequestError, NotFoundError } from "../../../../shared/errors.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import {
  mapMaraDetails,
  mapMaraToOrg,
  mapVisaDetails,
  mapVisaToService,
  type StagedMaraAgent,
  type StagedVisa,
} from "../lib/immigration-mappers.js";

export type OrgType = "business" | "institution";

const ORG_TABLE: Record<OrgType, { table: string; nameColumn: string }> = {
  business: { table: "businesses", nameColumn: "business_name" },
  institution: { table: "institutions", nameColumn: "institution_name" },
};

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

// ── promote_visa_to_service ─────────────────────────────────────────────────

/**
 * The target org for a visa. V1/V2 called the parameter `_department_business_id`
 * and could only address `businesses`; V3 splits orgs into owner-backed
 * `businesses` and unclaimed `institutions`, and an immigration department is
 * normally the latter — so the target is the polymorphic (type, id) pair the rest
 * of V3 uses.
 *
 * Schema provisioning happens BEFORE the transaction, because CREATE SCHEMA and
 * the tenant migrations run on their own connections. Identical to
 * promote.service.resolveTarget, including the consequence: a promote that fails
 * afterwards leaves an empty tenant schema behind, which the next attempt reuses.
 */
async function resolveOrg(orgType: OrgType, orgId: number) {
  const { table, nameColumn } = ORG_TABLE[orgType];
  const org = await masterKnex(table)
    .where({ id: orgId })
    .first("id", "schema_name", `${nameColumn} as name`);
  if (!org) throw new NotFoundError(`${orgType} ${orgId} not found`);

  let schemaName: string = org.schema_name;
  if (!schemaName) {
    const [row] = await masterKnex(table)
      .where({ id: orgId })
      .update({ schema_name: masterKnex.raw("gen_random_uuid()") })
      .returning("schema_name");
    schemaName = row.schema_name;
  }
  await provisionBusinessSchema(schemaName);
  return { orgType, orgId, schemaName, name: org.name as string };
}

export interface VisaPromoteResult {
  service_id: string;
  org_type: OrgType;
  org_id: number;
  schema_name: string;
}

export async function promoteVisa(
  id: string,
  orgType: OrgType,
  orgId: number,
): Promise<VisaPromoteResult> {
  const staged = (await masterKnex(`${S}.extraction_visas`).where({ id }).first()) as
    | StagedVisa
    | undefined;
  if (!staged) throw new NotFoundError("Visa not found");

  const target = await resolveOrg(orgType, orgId);

  return masterKnex.transaction(async (trx) => {
    const { row, reason } = mapVisaToService(staged, { serviceCategoryId: null, publish: true });
    // A staged row that cannot become an addressable service is a bad request, not
    // a server error: the operator has to re-run extraction or fix the row.
    if (!row) throw new BadRequestError(reason!);

    const [service] = await trx("business_services")
      .withSchema(target.schemaName)
      .insert({ ...row, updated_at: new Date() })
      .onConflict(["extraction_source_id"])
      .merge()
      .returning(["id"]);

    await trx("visa_service_details")
      .insert({ ...mapVisaDetails(staged, service.id, target.schemaName), updated_at: new Date() })
      .onConflict(["extraction_source_id"])
      .merge();

    await trx(`${S}.extraction_visas`).where({ id }).update({
      status: "promoted",
      promoted_service_id: service.id,
      updated_at: trx.fn.now(),
    });

    return {
      service_id: service.id as string,
      org_type: target.orgType,
      org_id: target.orgId,
      schema_name: target.schemaName,
    };
  });
}

// ── promote_mara_to_business ────────────────────────────────────────────────

export interface MaraPromoteResult {
  org_type: OrgType;
  org_id: number;
}

/**
 * Unlike the visa path this takes no target: V1's RPC created the org itself from
 * the scraped record, and there is nothing for an admin to pick from — a MARN is a
 * registration nobody has claimed yet. Re-promoting reuses the org already linked
 * to that MARN rather than minting a second listing for the same agent.
 */
export async function promoteMara(id: string): Promise<MaraPromoteResult> {
  const staged = (await masterKnex(`${S}.extraction_mara_agents`).where({ id }).first()) as
    | StagedMaraAgent
    | undefined;
  if (!staged) throw new NotFoundError("MARA agent not found");

  return masterKnex.transaction(async (trx) => {
    const existing = await trx("agent_mara_details")
      .where({ marn: staged.marn })
      .first("org_type", "org_id");

    let org: { type: OrgType; id: number };
    if (existing) {
      org = { type: existing.org_type as OrgType, id: existing.org_id as number };
    } else {
      const [created] = await trx("institutions").insert(mapMaraToOrg(staged)).returning(["id"]);
      org = { type: "institution", id: created.id as number };
    }

    await trx("agent_mara_details")
      .insert({ ...mapMaraDetails(staged, org), updated_at: new Date() })
      .onConflict(["marn"])
      .merge();

    await trx(`${S}.extraction_mara_agents`).where({ id }).update({
      status: "promoted",
      // The staging column FKs public.businesses, so it can only be set when the
      // promote landed on a business. An institution target leaves it null and
      // agent_mara_details carries the link — see 20260817_621's header.
      promoted_business_id: org.type === "business" ? org.id : null,
      updated_at: trx.fn.now(),
    });

    return { org_type: org.type, org_id: org.id };
  });
}
