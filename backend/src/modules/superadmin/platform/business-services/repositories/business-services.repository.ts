// Queries against a tenant schema's service catalog tables.
//
// `db` is a Knex whose search_path is one business's own schema — req.db for the
// tenant routes, a pool-manager handle for the superadmin oversight routes. Tenant
// isolation is therefore structural: there is no business_id to forget. Every read
// filters `deleted_at IS NULL`; nothing is ever hard-deleted.

import type { Knex } from "knex";
import { SERVICE_JSONB_COLUMNS, type AssignmentSpec, type ChildSpec } from "../consts.js";
import type { ServiceFilters } from "../schemas/business-services.schema.js";

export const SERVICES_TABLE = "business_services";

export type Row = Record<string, unknown>;

/**
 * node-pg renders a JS array as a Postgres array literal, which a jsonb column
 * rejects, and an object as `[object Object]`. Same fix the rest of the codebase
 * uses for businesses.meta: hand jsonb columns pre-serialised JSON text.
 */
export function serializeJsonb(values: Row, jsonbColumns: readonly string[]): Row {
  const out: Row = { ...values };
  for (const column of jsonbColumns) {
    if (column in out && out[column] !== null && out[column] !== undefined) {
      out[column] = JSON.stringify(out[column]);
    }
  }
  return out;
}

function live(db: Knex, table: string): Knex.QueryBuilder {
  return db(table).whereNull("deleted_at");
}

// ── business_services ───────────────────────────────────────────────────────

/**
 * service_categories lives in the master schema, which is always last on a
 * tenant search_path — so the join resolves without naming the schema. The
 * frontend service lists render `category_name`, so it travels with every row.
 */
function withCategory(query: Knex.QueryBuilder): Knex.QueryBuilder {
  return query
    .leftJoin("service_categories as cat", "cat.id", "s.service_category_id")
    .select("s.*", "cat.name as category_name");
}

function filtered(db: Knex, filters: ServiceFilters): Knex.QueryBuilder {
  const query = db(`${SERVICES_TABLE} as s`).whereNull("s.deleted_at");
  if (filters.search) query.where("s.name", "ilike", `%${filters.search}%`);
  if (filters.service_category_id !== undefined) query.where({ "s.service_category_id": filters.service_category_id });
  if (filters.degree_level_id !== undefined) query.where({ "s.degree_level_id": filters.degree_level_id });
  if (filters.area_of_study_id !== undefined) query.where({ "s.area_of_study_id": filters.area_of_study_id });
  if (filters.is_published !== undefined) query.where({ "s.is_published": filters.is_published });
  if (filters.is_featured !== undefined) query.where({ "s.is_featured": filters.is_featured });
  return query;
}

export async function listServices(db: Knex, filters: ServiceFilters, limit: number, offset: number): Promise<Row[]> {
  return withCategory(filtered(db, filters))
    .orderBy("s.created_at", "desc")
    .orderBy("s.id", "asc")
    .limit(limit)
    .offset(offset);
}

/** Unpaginated listing for the superadmin overview — a tenant's catalog is small. */
export async function listAllServices(db: Knex): Promise<Row[]> {
  return withCategory(filtered(db, {})).orderBy("s.created_at", "desc");
}

export async function countServices(db: Knex, filters: ServiceFilters): Promise<number> {
  const [{ count }] = await filtered(db, filters).count<{ count: string }[]>("s.id as count");
  return Number(count);
}

export async function findService(db: Knex, id: string): Promise<Row | undefined> {
  return withCategory(db(`${SERVICES_TABLE} as s`).whereNull("s.deleted_at").where({ "s.id": id })).first();
}

export async function insertService(db: Knex, values: Row): Promise<Row> {
  const [row] = await db(SERVICES_TABLE).insert(serializeJsonb(values, SERVICE_JSONB_COLUMNS)).returning("*");
  return row;
}

export async function updateService(db: Knex, id: string, values: Row): Promise<Row | undefined> {
  const [row] = await live(db, SERVICES_TABLE)
    .where({ id })
    .update({ ...serializeJsonb(values, SERVICE_JSONB_COLUMNS), updated_at: db.fn.now() })
    .returning("*");
  return row;
}

/** Soft delete. Returns undefined when the row was already gone (or never ours). */
export async function softDeleteService(db: Knex, id: string): Promise<Row | undefined> {
  const [row] = await live(db, SERVICES_TABLE)
    .where({ id })
    .update({ deleted_at: db.fn.now(), updated_at: db.fn.now() })
    .returning("*");
  return row;
}

// ── Child collections & the reusable library ────────────────────────────────

export async function listChildren(db: Knex, spec: ChildSpec, parentId: string): Promise<Row[]> {
  return live(db, spec.table).where({ [spec.parent]: parentId }).orderBy(spec.orderBy, "asc");
}

export async function listAll(db: Knex, table: string, orderBy: string): Promise<Row[]> {
  return live(db, table).orderBy(orderBy, "asc");
}

export async function findRow(db: Knex, table: string, id: string): Promise<Row | undefined> {
  return live(db, table).where({ id }).first();
}

export async function insertRow(
  db: Knex,
  table: string,
  values: Row,
  jsonbColumns: readonly string[] = [],
): Promise<Row> {
  const [row] = await db(table).insert(serializeJsonb(values, jsonbColumns)).returning("*");
  return row;
}

export async function updateRow(
  db: Knex,
  table: string,
  id: string,
  values: Row,
  jsonbColumns: readonly string[] = [],
): Promise<Row | undefined> {
  const [row] = await live(db, table)
    .where({ id })
    .update({ ...serializeJsonb(values, jsonbColumns), updated_at: db.fn.now() })
    .returning("*");
  return row;
}

export async function softDeleteRow(db: Knex, table: string, id: string): Promise<Row | undefined> {
  const [row] = await live(db, table)
    .where({ id })
    .update({ deleted_at: db.fn.now(), updated_at: db.fn.now() })
    .returning("*");
  return row;
}

// ── Assignment junctions ────────────────────────────────────────────────────

export async function listAssignments(db: Knex, spec: AssignmentSpec, serviceId: string): Promise<Row[]> {
  return live(db, spec.table).where({ service_id: serviceId }).orderBy("created_at", "asc");
}

export async function findAssignment(
  db: Knex,
  spec: AssignmentSpec,
  serviceId: string,
  targetId: string | number,
): Promise<Row | undefined> {
  return live(db, spec.table).where({ service_id: serviceId, [spec.column]: targetId }).first();
}

/**
 * (service_id, target) is UNIQUE on every junction, and rows are only ever
 * tombstoned — so re-assigning a previously unassigned pair has to revive the
 * tombstone rather than insert beside it. The caller has already rejected a
 * live duplicate with 409, so reaching the merge branch means a tombstone.
 */
export async function upsertAssignment(db: Knex, spec: AssignmentSpec, values: Row): Promise<Row> {
  const [row] = await db(spec.table)
    .insert(values)
    .onConflict(["service_id", spec.column])
    .merge({ ...values, deleted_at: null, updated_at: db.fn.now() })
    .returning("*");
  return row;
}

/** Unassign = tombstone the junction row. The shared entity itself is untouched. */
export async function softDeleteAssignment(
  db: Knex,
  spec: AssignmentSpec,
  serviceId: string,
  targetId: string | number,
): Promise<number> {
  return live(db, spec.table)
    .where({ service_id: serviceId, [spec.column]: targetId })
    .update({ deleted_at: db.fn.now(), updated_at: db.fn.now() });
}

// ── Dynamic per-category field values ───────────────────────────────────────

export async function getServiceFieldValues(db: Knex, serviceId: string): Promise<Row[]> {
  return db("schema_field_values")
    .where({ entity_type: SERVICES_TABLE, entity_id: serviceId })
    .select("schema_field_id", "value");
}

export async function upsertServiceFieldValues(
  db: Knex,
  serviceId: string,
  values: { schema_field_id: number; value?: unknown }[],
): Promise<Row[]> {
  await db.transaction(async (trx) => {
    for (const { schema_field_id, value } of values) {
      await trx("schema_field_values")
        .insert({ entity_type: SERVICES_TABLE, entity_id: serviceId, schema_field_id, value: JSON.stringify(value) })
        .onConflict(["entity_id", "entity_type", "schema_field_id"])
        .merge({ value: JSON.stringify(value), updated_at: trx.fn.now() });
    }
  });
  return getServiceFieldValues(db, serviceId);
}
