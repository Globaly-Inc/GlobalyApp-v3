// Service-vertical repository — staged reads for the eight V3-only verticals and
// the one promote path they share.
//
// PROMOTE IS TRANSACTIONAL and PROMOTE IS IDEMPOTENT, for exactly the reasons
// immigration.repository.ts documents: staging (superadmin.*), the master catalog
// rows (public.*) and the tenant service ("<uuid>".business_services) live in ONE
// database, so a single masterKnex transaction with schema-qualified writes covers
// the whole promote; and every promoted row carries `extraction_source_id`, which
// is UNIQUE on business_services (business/20260817_001), so a repeat promote
// updates in place.
//
// Table names come only from the vertical registry, never from a request — see
// lib/service-verticals.verticalSpec().

import { masterKnex } from "../../../../core/db/master-pool.js";
import { provisionBusinessSchema } from "../../../../core/business/provisioner.js";
import { BadRequestError, NotFoundError } from "../../../../shared/errors.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import {
  mapVerticalToService,
  summaryColumnsFor,
  type VerticalSpec,
} from "../lib/service-verticals.js";

export type OrgType = "business" | "institution";

const ORG_TABLE: Record<OrgType, { table: string; nameColumn: string }> = {
  business: { table: "businesses", nameColumn: "business_name" },
  institution: { table: "institutions", nameColumn: "institution_name" },
};

const REVIEW_STATUSES = ["pending", "promoted", "discarded"] as const;

function staging(spec: VerticalSpec) {
  return `${S}.${spec.table}`;
}

export async function listRows(spec: VerticalSpec, opts: { status?: string; limit: number }) {
  const query = masterKnex(staging(spec))
    .select(summaryColumnsFor(spec))
    .orderBy("created_at", "desc")
    .limit(opts.limit);
  if (opts.status) query.where("status", opts.status);
  return query;
}

/** Per-status counts for one vertical — one grouped query per table, not per status. */
export async function countByStatus(spec: VerticalSpec) {
  const rows = await masterKnex(staging(spec)).select("status").count("id as count").groupBy("status");
  const counts: Record<string, number> = Object.fromEntries(REVIEW_STATUSES.map((s) => [s, 0]));
  let total = 0;
  for (const row of rows) {
    const n = Number(row.count);
    counts[row.status as string] = (counts[row.status as string] ?? 0) + n;
    total += n;
  }
  return { ...counts, total };
}

export async function updateStatus(spec: VerticalSpec, id: string, status: string) {
  const count = await masterKnex(staging(spec))
    .where({ id })
    .update({ status, updated_at: masterKnex.fn.now() });
  return count > 0;
}

/**
 * The target org. Schema provisioning happens BEFORE the transaction because
 * CREATE SCHEMA and the tenant migrations run on their own connections — identical
 * to immigration.repository.resolveOrg, including the consequence: a promote that
 * fails afterwards leaves an empty tenant schema behind, which the next attempt
 * reuses.
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
  return { orgType, orgId, schemaName };
}

/**
 * The live catalog category for a vertical, resolved from its slug rather than
 * taken from the caller. Null when the reference row is absent (the categories are
 * V1-imported reference data) — business_services.service_category_id is nullable
 * and promote.service already passes null the same way.
 */
async function resolveCategoryId(spec: VerticalSpec): Promise<number | null> {
  const row = await masterKnex("service_categories").where({ slug: spec.slug }).first("id");
  return row ? Number(row.id) : null;
}

export interface VerticalPromoteResult {
  service_id: string;
  org_type: OrgType;
  org_id: number;
  schema_name: string;
}

export async function promote(
  spec: VerticalSpec,
  id: string,
  orgType: OrgType,
  orgId: number,
): Promise<VerticalPromoteResult> {
  const staged = await masterKnex(staging(spec)).where({ id }).first(await promoteColumns(spec));
  if (!staged) throw new NotFoundError(`${spec.label} row not found`);
  // An admin already rejected this row. Promoting it would silently undo that
  // decision, so it is a bad request until someone re-opens it.
  if (staged.status === "discarded") {
    throw new BadRequestError(`This ${spec.label} row was discarded — re-extract or reset it first`);
  }

  const serviceCategoryId = await resolveCategoryId(spec);
  const target = await resolveOrg(orgType, orgId);

  return masterKnex.transaction(async (trx) => {
    const { row, reason } = mapVerticalToService(spec, staged, { serviceCategoryId, publish: true });
    // A staged row that cannot become an addressable service is a bad request, not
    // a server error: the operator has to fix the row or re-run extraction.
    if (!row) throw new BadRequestError(reason!);

    const [service] = await trx("business_services")
      .withSchema(target.schemaName)
      .insert({ ...row, updated_at: new Date() })
      .onConflict(["extraction_source_id"])
      .merge()
      .returning(["id"]);

    await trx(staging(spec)).where({ id }).update({
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

/**
 * Every column of a vertical's staging table, named explicitly.
 *
 * Promote must carry the whole staged row — the vertical's own fields are what
 * land in business_services.category_specific_data — but these eight tables are
 * 62–90 columns wide, and a hand-written 600-line manifest would silently rot the
 * first time a migration adds a column. The names are resolved from the catalog
 * once per table and cached, so the emitted SQL still lists every column and a
 * column that does not exist can never be selected. Same "resolve columns by
 * introspecting" convention the stage-2 migration scripts use (§1.5).
 */
const columnCache = new Map<string, string[]>();

async function promoteColumns(spec: VerticalSpec): Promise<string[]> {
  const cached = columnCache.get(spec.table);
  if (cached) return cached;
  const columns: string[] = await masterKnex("information_schema.columns")
    .where({ table_schema: S, table_name: spec.table })
    .orderBy("ordinal_position")
    .pluck("column_name");
  if (columns.length === 0) throw new Error(`${S}.${spec.table} has no columns — is the migration applied?`);
  columnCache.set(spec.table, columns);
  return columns;
}
