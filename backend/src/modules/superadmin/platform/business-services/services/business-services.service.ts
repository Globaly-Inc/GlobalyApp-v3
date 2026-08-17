// Tenant service catalog business logic.
//
// Isolation contract: every entry point takes one business's tenant Knex and
// asserts the parent exists *in that schema* before touching anything below it.
// Another tenant's uuid is therefore indistinguishable from a nonexistent one —
// both are a 404, on reads and mutations alike.

import type { Knex } from "knex";
import { masterKnex } from "../../../../../core/db/master-pool.js";
import { getKnex } from "../../../../../core/db/pool-manager.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../../../../shared/errors.js";
import {
  buildPaginatedResponse,
  paginationToOffset,
  type PaginationInput,
} from "../../../../../shared/pagination.js";
import * as platformRepo from "../../platform.repository.js";
import {
  INSTALLMENTS,
  SERVICE_ASSIGNMENTS,
  SERVICE_CHILDREN,
  SERVICE_LIBRARY,
  type AssignmentKey,
  type ChildKey,
  type LibraryKey,
} from "../consts.js";
import type { ServiceFilters } from "../schemas/business-services.schema.js";
import * as repo from "../repositories/business-services.repository.js";

type Row = repo.Row;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Superadmin entry point: resolve a business id to that business's tenant Knex.
 * The tenant routes already have it as req.db and never call this.
 */
export async function businessDb(businessId: number): Promise<Knex> {
  const biz = await platformRepo.findBusinessById(businessId);
  if (!biz) throw new NotFoundError("Business not found");
  return getKnex(biz.id, biz.schema_name);
}

// ── Services ────────────────────────────────────────────────────────────────

export async function listServices(db: Knex, filters: ServiceFilters, pagination: PaginationInput) {
  const { limit, offset } = paginationToOffset(pagination);
  const [rows, total] = await Promise.all([
    repo.listServices(db, filters, limit, offset),
    repo.countServices(db, filters),
  ]);
  return buildPaginatedResponse(rows, total, pagination);
}

/** Unpaginated listing — the superadmin overview. */
export async function listAllServices(db: Knex) {
  return repo.listAllServices(db);
}

/** The one place a service id is turned into a row. Everything below funnels here. */
async function assertService(db: Knex, id: string): Promise<Row> {
  const service = await repo.findService(db, id);
  if (!service) throw new NotFoundError("Service not found");
  return service;
}

export async function getService(db: Knex, id: string) {
  const service = await assertService(db, id);
  return { ...service, children: await loadChildren(db, id) };
}

async function loadChildren(db: Knex, serviceId: string) {
  const childKeys = Object.keys(SERVICE_CHILDREN) as ChildKey[];
  const assignmentKeys = Object.keys(SERVICE_ASSIGNMENTS) as AssignmentKey[];

  const [childRows, assignmentRows] = await Promise.all([
    Promise.all(childKeys.map((key) => repo.listChildren(db, SERVICE_CHILDREN[key], serviceId))),
    Promise.all(assignmentKeys.map((key) => repo.listAssignments(db, SERVICE_ASSIGNMENTS[key], serviceId))),
  ]);

  const children: Record<string, Row[]> = {};
  childKeys.forEach((key, i) => {
    // fee-structures -> fee_structures: the wire shape uses snake_case like the columns.
    children[key.replace(/-/g, "_")] = childRows[i];
  });

  const assignments: Record<string, Row[]> = {};
  assignmentKeys.forEach((key, i) => {
    assignments[key.replace(/-/g, "_")] = assignmentRows[i];
  });

  return { ...children, assignments };
}

export async function createService(db: Knex, input: Row) {
  return repo.insertService(db, input);
}

export async function updateService(db: Knex, id: string, input: Row) {
  await assertService(db, id);
  const row = await repo.updateService(db, id, input);
  if (!row) throw new NotFoundError("Service not found");
  return row;
}

export async function deleteService(db: Knex, id: string) {
  await assertService(db, id);
  const row = await repo.softDeleteService(db, id);
  if (!row) throw new NotFoundError("Service not found");
  return { id, deleted: true };
}

export async function setPublished(db: Knex, id: string, isPublished: boolean) {
  await assertService(db, id);
  const row = await repo.updateService(db, id, { is_published: isPublished });
  if (!row) throw new NotFoundError("Service not found");
  return row;
}

// ── Child collections ───────────────────────────────────────────────────────

export async function listChildren(db: Knex, key: ChildKey, serviceId: string) {
  await assertService(db, serviceId);
  return repo.listChildren(db, SERVICE_CHILDREN[key], serviceId);
}

export async function createChild(db: Knex, key: ChildKey, serviceId: string, input: Row) {
  await assertService(db, serviceId);
  const spec = SERVICE_CHILDREN[key];
  return repo.insertRow(db, spec.table, { ...input, [spec.parent]: serviceId }, spec.jsonb);
}

/** A child is only addressable through the service that owns it. */
async function assertChild(db: Knex, key: ChildKey, serviceId: string, childId: string): Promise<Row> {
  await assertService(db, serviceId);
  const spec = SERVICE_CHILDREN[key];
  const row = await repo.findRow(db, spec.table, childId);
  if (!row || row[spec.parent] !== serviceId) throw new NotFoundError(`${key} not found for this service`);
  return row;
}

export async function updateChild(db: Knex, key: ChildKey, serviceId: string, childId: string, input: Row) {
  await assertChild(db, key, serviceId, childId);
  const spec = SERVICE_CHILDREN[key];
  const row = await repo.updateRow(db, spec.table, childId, input, spec.jsonb);
  if (!row) throw new NotFoundError(`${key} not found for this service`);
  return row;
}

export async function deleteChild(db: Knex, key: ChildKey, serviceId: string, childId: string) {
  await assertChild(db, key, serviceId, childId);
  const spec = SERVICE_CHILDREN[key];
  const row = await repo.softDeleteRow(db, spec.table, childId);
  if (!row) throw new NotFoundError(`${key} not found for this service`);
  return { id: childId, deleted: true };
}

// ── Fee installments (grandchild: service -> fee structure -> installment) ───

async function assertStructure(db: Knex, serviceId: string, structureId: string): Promise<Row> {
  return assertChild(db, "fee-structures", serviceId, structureId);
}

export async function listInstallments(db: Knex, serviceId: string, structureId: string) {
  await assertStructure(db, serviceId, structureId);
  return repo.listChildren(db, INSTALLMENTS, structureId);
}

export async function createInstallment(db: Knex, serviceId: string, structureId: string, input: Row) {
  await assertStructure(db, serviceId, structureId);
  return repo.insertRow(db, INSTALLMENTS.table, { ...input, fee_structure_id: structureId });
}

export async function deleteInstallment(db: Knex, serviceId: string, structureId: string, childId: string) {
  await assertStructure(db, serviceId, structureId);
  const row = await repo.findRow(db, INSTALLMENTS.table, childId);
  if (!row || row.fee_structure_id !== structureId) throw new NotFoundError("Installment not found");
  await repo.softDeleteRow(db, INSTALLMENTS.table, childId);
  return { id: childId, deleted: true };
}

// ── Reusable library (schema-level, no parent service) ──────────────────────

export async function listLibrary(db: Knex, key: LibraryKey) {
  const spec = SERVICE_LIBRARY[key];
  return repo.listAll(db, spec.table, spec.orderBy);
}

export async function createLibraryItem(db: Knex, key: LibraryKey, input: Row) {
  return repo.insertRow(db, SERVICE_LIBRARY[key].table, input);
}

export async function updateLibraryItem(db: Knex, key: LibraryKey, id: string, input: Row) {
  const row = await repo.updateRow(db, SERVICE_LIBRARY[key].table, id, input);
  if (!row) throw new NotFoundError(`${key} not found`);
  return row;
}

export async function deleteLibraryItem(db: Knex, key: LibraryKey, id: string) {
  const row = await repo.softDeleteRow(db, SERVICE_LIBRARY[key].table, id);
  if (!row) throw new NotFoundError(`${key} not found`);
  return { id, deleted: true };
}

// ── Assignment junctions ────────────────────────────────────────────────────

export async function listAssignments(db: Knex, key: AssignmentKey, serviceId: string) {
  await assertService(db, serviceId);
  return repo.listAssignments(db, SERVICE_ASSIGNMENTS[key], serviceId);
}

/**
 * The target must exist. A tenant target is looked up in the caller's own schema,
 * so another business's fee id is a 404 — the junction can never span tenants.
 * accreditations are the one master-schema target (integer id, shared vocabulary).
 */
async function assertTarget(spec: { target: string | null }, db: Knex, targetId: string | number) {
  if (spec.target === null) {
    const row = await masterKnex("accreditations").where({ id: targetId }).whereNull("deleted_at").first("id");
    if (!row) throw new NotFoundError("Accreditation not found");
    return;
  }
  const row = await repo.findRow(db, spec.target, String(targetId));
  if (!row) throw new NotFoundError("Assignment target not found");
}

export async function createAssignment(db: Knex, key: AssignmentKey, serviceId: string, input: Row) {
  await assertService(db, serviceId);
  const spec = SERVICE_ASSIGNMENTS[key];
  const targetId = input[spec.column] as string | number | undefined;
  if (targetId === undefined || targetId === null) throw new BadRequestError(`${spec.column} is required`);
  await assertTarget(spec, db, targetId);

  const existing = await repo.findAssignment(db, spec, serviceId, targetId);
  if (existing) throw new ConflictError("Already assigned to this service");

  return repo.upsertAssignment(db, spec, { ...input, service_id: serviceId });
}

export async function deleteAssignment(db: Knex, key: AssignmentKey, serviceId: string, targetId: string) {
  await assertService(db, serviceId);
  const spec = SERVICE_ASSIGNMENTS[key];
  let target: string | number = targetId;
  if (spec.target === null) {
    target = Number(targetId);
    if (!Number.isInteger(target)) throw new BadRequestError("accreditation_id must be an integer");
  } else if (!UUID_RE.test(targetId)) {
    throw new BadRequestError("target id must be a uuid");
  }

  const removed = await repo.softDeleteAssignment(db, spec, serviceId, target);
  if (removed === 0) throw new NotFoundError("Assignment not found");
  return { deleted: true };
}

// ── Dynamic per-category field values ───────────────────────────────────────

export async function getServiceFieldValues(db: Knex, serviceId: string) {
  await assertService(db, serviceId);
  return repo.getServiceFieldValues(db, serviceId);
}

export async function upsertServiceFieldValues(
  db: Knex,
  serviceId: string,
  values: { schema_field_id: number; value?: unknown }[],
) {
  await assertService(db, serviceId);
  return repo.upsertServiceFieldValues(db, serviceId, values);
}
