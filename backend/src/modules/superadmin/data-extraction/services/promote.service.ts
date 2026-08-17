// Promote service — moves an extraction job's staged rows into the live
// per-tenant catalog.
//
// GUARANTEES
//
// Transactional. Staging (superadmin.*), the tenant catalog and the master
// catalog_services projection all live in the same database, so the whole promote
// runs in ONE masterKnex transaction with schema-qualified writes. A failure
// anywhere rolls back everything, projection included (it is trigger-maintained,
// so it commits with the write). Nothing half-promoted is ever visible.
//
// Idempotent. Every promoted row carries `extraction_source_id` (see
// business/20260817_001_catalog_extraction_keys.ts) and is written with
// INSERT .. ON CONFLICT .. MERGE on that key; junctions dedupe on their
// (service_id, target) unique. Promoting the same job twice updates in place and
// leaves exactly one set of rows.
//
// Audited. superadmin.extraction_promotions gets a row per attempt with the
// target org, the counts and the full unresolved list. logAudit() records the
// action itself.
//
// Nothing is guessed. A staged row that cannot become a valid live row is left in
// staging and reported in `unresolved` with a reason. An optional reference that
// did not resolve is a `warning`, and the row promotes with NULL — the catalog
// migrations chose nullable reference columns for exactly this.
//
// ONE THING THAT IS NOT IN THE TRANSACTION
// Creating the target institution and provisioning its schema (CREATE SCHEMA +
// tenant migrations, on their own connections) happens before the transaction
// opens. If the promote then fails, an empty tenant schema and an unpublished,
// unclaimed institution with zero services are left behind — no catalog data is
// visible, and the next attempt reuses both. This applies to `dry_run` too: a dry
// run of a job with no existing target still creates the listing it would have
// promoted into, and reports it as `target.org_created`. Refusing instead would
// make dry runs useless for the common first-promote case, and the leftover is an
// unpublished directory row with an empty catalog.
//
// ponytail: no rollback endpoint. extraction_source_id makes one a two-line
// DELETE, but unwinding rows an operator may have since edited is a product
// decision, not a plumbing one. Add it when someone asks.

import type { Knex } from "knex";

import { masterKnex } from "../../../../core/db/master-pool.js";
import { provisionBusinessSchema } from "../../../../core/business/provisioner.js";
import { BadRequestError, NotFoundError } from "../../../../shared/errors.js";
import { logAudit } from "../shared/audit.js";
import * as jobsRepo from "../repositories/jobs.repository.js";
import * as repo from "../repositories/promote.repository.js";
import { PROMOTABLE_JOB_STATUSES } from "../schemas/jobs.schema.js";
import type { PromoteJobInput } from "../schemas/promote.schema.js";
import {
  buildRefIndex,
  mapCourseToService,
  mapEligibility,
  mapFee,
  mapIntake,
  mapStudyOption,
  mapStudyUnit,
  normalizeUnitType,
  resolveRef,
} from "../lib/promote-mappers.js";

export interface UnresolvedRow {
  table: string;
  id: string;
  reason: string;
}

export interface PromoteReport {
  job_id: string;
  dry_run: boolean;
  target: {
    org_type: repo.OrgType;
    org_id: number;
    /** Legacy V2 key — null when the target is an (unclaimed) institution. */
    business_id: number | null;
    schema_name: string;
    name: string;
    org_created: boolean;
  };
  counts: Record<string, number>;
  unresolved: UnresolvedRow[];
  warnings: string[];
  not_promoted: Record<string, { count: number; reason: string }>;
}

class DryRunComplete extends Error {
  constructor(public readonly report: PromoteReport) {
    super("dry run");
  }
}

export async function promoteJob(
  jobId: string,
  adminId: number,
  input: PromoteJobInput = {},
): Promise<PromoteReport> {
  const job = await jobsRepo.findJobById(jobId);
  if (!job) throw new NotFoundError("Extraction job not found");

  const status = (job as { status: string }).status;
  if (!PROMOTABLE_JOB_STATUSES.includes(status as (typeof PROMOTABLE_JOB_STATUSES)[number])) {
    throw new BadRequestError(
      `Job status "${status}" is not promotable. Must be one of: ${PROMOTABLE_JOB_STATUSES.join(", ")}`,
    );
  }

  const overview = await masterKnex("superadmin.extraction_institution_overview").where({ job_id: jobId }).first();
  const target = await resolveTarget(job as JobRow, overview, input);

  try {
    const report = await masterKnex.transaction((trx) =>
      promoteInTransaction(trx, job as JobRow, target, adminId, input),
    );
    await logAudit(adminId, "EXTRACTION_PROMOTE", {
      entityType: "extraction_jobs",
      entityId: jobId,
      details: { ...report.counts, target: report.target, unresolved: report.unresolved.length },
    });
    return report;
  } catch (err) {
    if (err instanceof DryRunComplete) {
      await logAudit(adminId, "EXTRACTION_PROMOTE_DRY_RUN", {
        entityType: "extraction_jobs",
        entityId: jobId,
        details: { ...err.report.counts, unresolved: err.report.unresolved.length },
      });
      return err.report;
    }
    throw err;
  }
}

export async function listPromotions(jobId: string) {
  const job = await jobsRepo.findJobById(jobId);
  if (!job) throw new NotFoundError("Extraction job not found");
  return { promotions: await repo.listPromotions(jobId) };
}

// ── Target org ──────────────────────────────────────────────────────────────

interface JobRow {
  id: string;
  institution_name: string | null;
  institution_url: string;
  service_category_id: number | null;
}

interface ResolvedTarget extends repo.TargetOrg {
  schema_name: string;
  org_created: boolean;
  schema_provisioned: boolean;
}

/**
 * An extraction job has no org column — it only knows a URL and a name. So the
 * target is either given explicitly by the caller, matched against an existing
 * org, or created as a new unclaimed institution. Either way it must end up with
 * a provisioned tenant schema before anything can be written.
 */
async function resolveTarget(
  job: JobRow,
  overview: Record<string, any> | undefined,
  input: PromoteJobInput,
): Promise<ResolvedTarget> {
  let created = false;
  let org: repo.TargetOrg | null;

  if (input.target_org_type && input.target_org_id) {
    org = await repo.findOrgById(input.target_org_type, input.target_org_id);
    if (!org) throw new NotFoundError(`${input.target_org_type} ${input.target_org_id} not found`);
  } else {
    org = await repo.findOrgForJob(job, overview?.name, overview?.website);
    if (!org) {
      const name = (overview?.name ?? job.institution_name ?? "").trim();
      if (!name) {
        throw new BadRequestError(
          "Job has no institution name — cannot create a target org. Re-run the overview step or pass target_org_type/target_org_id.",
        );
      }
      org = await repo.createInstitutionForJob({
        name,
        website: overview?.website ?? job.institution_url,
        overview,
        jobId: job.id,
      });
      created = true;
    }
  }

  // An unclaimed institution normally has no schema yet — that is the expected
  // path, not an error. Provisioning is idempotent (CREATE SCHEMA IF NOT EXISTS +
  // knex migrations tracked per schema), so it also repairs an org whose schema
  // predates the catalog migrations.
  const schemaName = org.schema_name ?? (await repo.assignSchemaName(org.org_type, org.org_id));
  await provisionBusinessSchema(schemaName);

  return { ...org, schema_name: schemaName, org_created: created, schema_provisioned: true };
}

// ── The transaction ─────────────────────────────────────────────────────────

async function promoteInTransaction(
  trx: Knex.Transaction,
  job: JobRow,
  target: ResolvedTarget,
  adminId: number,
  input: PromoteJobInput,
): Promise<PromoteReport> {
  const schema = target.schema_name;
  const publish = input.publish ?? true;
  const dryRun = input.dry_run ?? false;

  const staging = await repo.loadStaging(trx, job.id);
  const references = await repo.loadReferences(trx);

  const degreeLevels = buildRefIndex(references.degreeLevels);
  const areasOfStudy = buildRefIndex(references.areasOfStudy);
  const accreditations = buildRefIndex(references.accreditations);

  const unresolved: UnresolvedRow[] = [];
  const warnings: string[] = [];
  const counts: Record<string, number> = {};
  const bump = (key: string, by = 1) => {
    counts[key] = (counts[key] ?? 0) + by;
  };

  // ── services ──
  const serviceRows: Record<string, unknown>[] = [];
  for (const course of staging.courses) {
    const { row, warnings: w, reason } = mapCourseToService(course as never, {
      serviceCategoryId: job.service_category_id ?? null,
      degreeLevels,
      areasOfStudy,
      publish,
      jobId: job.id,
    });
    if (!row) {
      unresolved.push({ table: "extraction_courses", id: course.id, reason: reason! });
      continue;
    }
    for (const message of w) warnings.push(`course ${course.id}: ${message}`);
    serviceRows.push({ ...row });
  }

  const alreadyPromoted = await repo.existingSourceIds(
    trx,
    schema,
    "business_services",
    serviceRows.map((r) => r.extraction_source_id as string),
  );

  const serviceIdByCourse = new Map<string, string>();
  if (serviceRows.length) {
    const upserted = await repo.upsertRows(trx, schema, "business_services", serviceRows, ["extraction_source_id"]);
    for (const row of upserted) serviceIdByCourse.set(row.extraction_source_id, row.id);
  }
  bump("services_inserted", serviceRows.filter((r) => !alreadyPromoted.has(r.extraction_source_id as string)).length);
  bump("services_reused", alreadyPromoted.size);

  /** (staged child → the services it belongs to), from a junction table. */
  const pairsFromAssignments = (
    assignments: Record<string, any>[],
    childColumn: string,
  ): Map<string, string[]> => {
    const byChild = new Map<string, string[]>();
    for (const a of assignments) {
      const childId = a[childColumn];
      const serviceId = a.course_id ? serviceIdByCourse.get(a.course_id) : undefined;
      if (!childId || !serviceId) continue;
      const list = byChild.get(childId);
      if (list) list.push(serviceId);
      else byChild.set(childId, [serviceId]);
    }
    return byChild;
  };

  // ── fees ──
  // The live table puts service_id on the row (V1's dominant shape: 356 fee rows
  // with service_id vs 5 junction rows), so one staged fee shared by N courses
  // becomes N live rows — which is why the unique key is (service_id, source).
  const feeServices = pairsFromAssignments(staging.feeAssignments, "course_fee_id");
  const feeRows: Record<string, unknown>[] = [];
  for (const fee of staging.fees) {
    const services = feeServices.get(fee.id);
    if (!services?.length) {
      unresolved.push({
        table: "extraction_course_fees",
        id: fee.id,
        reason: "no promoted course assigned — live service_fees.service_id is NOT NULL",
      });
      continue;
    }
    for (const serviceId of services) {
      const { row, warnings: w } = mapFee(fee as never, serviceId);
      for (const message of w) warnings.push(`fee ${fee.id}: ${message}`);
      feeRows.push(row!);
    }
  }
  if (feeRows.length) {
    await repo.upsertRows(trx, schema, "service_fees", feeRows, ["service_id", "extraction_source_id"]);
  }
  bump("fees_inserted", feeRows.length);

  // ── intakes ──
  // Staging links intakes two ways: intake.course_id directly and the assignment
  // junction. Both are honoured; the (service_id, source) unique collapses overlap.
  const intakeServices = pairsFromAssignments(staging.intakeAssignments, "intake_id");
  const intakeRows: Record<string, unknown>[] = [];
  for (const intake of staging.intakes) {
    const services = new Set(intakeServices.get(intake.id) ?? []);
    const direct = intake.course_id ? serviceIdByCourse.get(intake.course_id) : undefined;
    if (direct) services.add(direct);
    if (!services.size) {
      unresolved.push({
        table: "extraction_intakes",
        id: intake.id,
        reason: "no promoted course assigned — live service_intakes.service_id is NOT NULL",
      });
      continue;
    }
    for (const serviceId of services) intakeRows.push(mapIntake(intake as never, serviceId));
  }
  if (intakeRows.length) {
    await repo.upsertRows(trx, schema, "service_intakes", intakeRows, ["service_id", "extraction_source_id"]);
  }
  bump("intakes_inserted", intakeRows.length);

  // ── eligibility ──
  const eligibilityServices = pairsFromAssignments(staging.eligibilityAssignments, "eligibility_requirement_id");
  const eligibilityRows: Record<string, unknown>[] = [];
  for (const req of staging.eligibility) {
    const services = eligibilityServices.get(req.id);
    if (!services?.length) {
      unresolved.push({
        table: "extraction_eligibility_requirements",
        id: req.id,
        reason: "no promoted course assigned — a requirement with no service is unreachable",
      });
      continue;
    }
    for (const serviceId of services) {
      const { row, warnings: w } = mapEligibility(req as never, serviceId, degreeLevels);
      for (const message of w) warnings.push(`eligibility ${req.id}: ${message}`);
      eligibilityRows.push(row!);
    }
  }
  if (eligibilityRows.length) {
    await repo.upsertRows(trx, schema, "service_eligibility_requirements", eligibilityRows, [
      "service_id",
      "extraction_source_id",
    ]);
  }
  bump("eligibility_inserted", eligibilityRows.length);

  // ── study options (live table has no service_id — the junction carries it) ──
  const optionServices = pairsFromAssignments(staging.studyOptionAssignments, "study_option_id");
  const optionRows: Record<string, unknown>[] = [];
  const optionLinks: { source: string; services: string[] }[] = [];
  for (const option of staging.studyOptions) {
    const services = optionServices.get(option.id);
    if (!services?.length) {
      unresolved.push({
        table: "extraction_study_options",
        id: option.id,
        reason: "no promoted course assigned — an unlinked study option is unreachable",
      });
      continue;
    }
    const { row, reason } = mapStudyOption(option as never);
    if (!row) {
      unresolved.push({ table: "extraction_study_options", id: option.id, reason: reason! });
      continue;
    }
    optionRows.push(row);
    optionLinks.push({ source: option.id, services });
  }
  if (optionRows.length) {
    const upserted = await repo.upsertRows(trx, schema, "service_study_options", optionRows, [
      "extraction_source_id",
    ]);
    const idBySource = new Map(upserted.map((r) => [r.extraction_source_id, r.id]));
    const junctions = optionLinks.flatMap(({ source, services }) =>
      services.map((serviceId) => ({ service_id: serviceId, study_option_id: idBySource.get(source)! })),
    );
    bump(
      "study_option_links",
      await repo.insertJunctions(trx, schema, "service_study_option_assignments", junctions, [
        "service_id",
        "study_option_id",
      ]),
    );
  }
  bump("study_options_inserted", optionRows.length);

  // ── study units ──
  const unitServices = pairsFromAssignments(staging.studyUnitAssignments, "study_unit_id");
  const unitRows: Record<string, unknown>[] = [];
  const unitLinks: { source: string; services: string[]; unitType: string }[] = [];
  for (const unit of staging.studyUnits) {
    const services = unitServices.get(unit.id);
    if (!services?.length) {
      unresolved.push({
        table: "extraction_study_units",
        id: unit.id,
        reason: "no promoted course assigned — an unlinked study unit is unreachable",
      });
      continue;
    }
    const { row, reason } = mapStudyUnit(unit as never);
    if (!row) {
      unresolved.push({ table: "extraction_study_units", id: unit.id, reason: reason! });
      continue;
    }
    unitRows.push(row);
    unitLinks.push({ source: unit.id, services, unitType: normalizeUnitType(unit.unit_type) ?? "compulsory" });
  }
  if (unitRows.length) {
    const upserted = await repo.upsertRows(trx, schema, "service_study_units", unitRows, ["extraction_source_id"]);
    const idBySource = new Map(upserted.map((r) => [r.extraction_source_id, r.id]));
    const junctions = unitLinks.flatMap(({ source, services, unitType }) =>
      services.map((serviceId) => ({
        service_id: serviceId,
        study_unit_id: idBySource.get(source)!,
        unit_type: unitType,
      })),
    );
    bump(
      "study_unit_links",
      await repo.insertJunctions(trx, schema, "service_study_unit_assignments", junctions, [
        "service_id",
        "study_unit_id",
      ]),
    );
  }
  bump("study_units_inserted", unitRows.length);

  // ── accreditations ──
  // The live junction needs public.accreditations.id (integer). Staging's own
  // accreditation_id column is a uuid pointing at the abandoned placeholder table,
  // so the only honest bridge is the extracted name. No match → left in staging.
  const accreditationJunctions: Record<string, unknown>[] = [];
  for (const assignment of staging.accreditationAssignments) {
    const serviceId = assignment.course_id ? serviceIdByCourse.get(assignment.course_id) : undefined;
    if (!serviceId) continue; // its course is already reported
    const accreditationId = resolveRef(accreditations, assignment.extraction_accreditation_name);
    if (!accreditationId) {
      unresolved.push({
        table: "extraction_course_accreditation_assignments",
        id: assignment.id,
        reason: `accreditation "${assignment.extraction_accreditation_name ?? "?"}" does not match any public.accreditations row`,
      });
      continue;
    }
    accreditationJunctions.push({ service_id: serviceId, accreditation_id: accreditationId });
  }
  if (accreditationJunctions.length) {
    bump(
      "accreditation_links",
      await repo.insertJunctions(trx, schema, "service_accreditation_assignments", accreditationJunctions, [
        "service_id",
        "accreditation_id",
      ]),
    );
  }

  // Campuses have no per-tenant home: V3 models branches as org↔org rows in the
  // master schema (business_branches), not as addresses hanging off a service.
  // Reported, left in staging — promoting them would mean inventing an org per
  // campus.
  const not_promoted: PromoteReport["not_promoted"] = {};
  if (staging.campusCount) {
    not_promoted.campuses = {
      count: staging.campusCount,
      reason: "no per-tenant campus table — V3 branches are master-schema org↔org rows (business_branches)",
    };
  }

  const report: PromoteReport = {
    job_id: job.id,
    dry_run: dryRun,
    target: {
      org_type: target.org_type,
      org_id: target.org_id,
      business_id: target.org_type === "business" ? target.org_id : null,
      schema_name: schema,
      name: target.name,
      org_created: target.org_created,
    },
    counts,
    unresolved,
    warnings,
    not_promoted,
  };

  await repo.recordPromotion(trx, {
    job_id: job.id,
    target_org_type: target.org_type,
    target_org_id: target.org_id,
    schema_name: schema,
    org_created: target.org_created,
    schema_provisioned: target.schema_provisioned,
    promoted_by: adminId,
    dry_run: dryRun,
    counts,
    unresolved,
  });

  await trx("superadmin.extraction_jobs").where({ id: job.id }).update({
    status: "exported",
    updated_at: trx.fn.now(),
  });

  // Rolling the whole thing back is the only way a dry run can report real
  // conflict/constraint outcomes instead of a guess.
  if (dryRun) throw new DryRunComplete(report);

  return report;
}
