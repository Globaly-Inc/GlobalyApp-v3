// Supporting service — site profiles, lessons, save-and-learn.

import { z } from "zod";
import { BadRequestError, NotFoundError } from "../../../../shared/errors.js";
import { logAudit } from "../shared/audit.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import * as repo from "../repositories/supporting.repository.js";
import { deriveIntakeMonthYear } from "../lib/staging-writer.js";
import { coercePartialDate, normaliseStored } from "../lib/partial-date.js";
import {
  AcademicTestSchema,
  IntakeCustomDateSchema,
  LanguageTestSchema,
  SCORE_TYPES,
} from "../schemas/staged.schema.js";
import type { SaveAndLearnInput } from "../schemas/supporting.schema.js";

const logger = createChildLogger("supporting-service");

// ── Site profiles ──

export async function listSiteProfiles(opts: { search?: string; limit: number }) {
  return { profiles: await repo.listSiteProfiles(opts) };
}

export async function getJobSiteProfile(jobId: string) {
  const url = await repo.getJobUrl(jobId);
  if (!url) throw new NotFoundError("Job not found");
  const domain = new URL(url).hostname.replace(/^www\./, "");
  const profile = await repo.findSiteProfileByDomain(domain);
  return { profile: profile ?? null };
}

export async function upsertSiteProfile(data: Record<string, unknown>, adminId: number) {
  await repo.upsertSiteProfile(data);
  await logAudit(adminId, "SITE_PROFILE_UPSERT", {
    entityType: "extraction_site_profiles",
    details: { domain: data.domain },
  });
  return { updated: true };
}

// ── Lessons ──

export async function listLessons(opts: {
  domain?: string;
  step?: string;
  scope?: string;
  activeOnly?: boolean;
  limit: number;
}) {
  return { lessons: await repo.listLessons(opts) };
}

export async function patchLesson(id: string, isActive: boolean, adminId: number) {
  const found = await repo.updateLesson(id, { is_active: isActive });
  if (!found) throw new NotFoundError("Lesson not found");
  await logAudit(adminId, "LESSON_PATCH", { entityType: "extraction_lessons", entityId: id });
  return { updated: true };
}

export async function deleteLesson(id: string, adminId: number) {
  const found = await repo.deleteLesson(id);
  if (!found) throw new NotFoundError("Lesson not found");
  await logAudit(adminId, "LESSON_DELETE", { entityType: "extraction_lessons", entityId: id });
  return { deleted: true };
}

// ── Save and learn ──

// Map table names to extraction_memory step values
const TABLE_TO_STEP: Record<string, string> = {
  extraction_courses: "courses",
  extraction_institution_overview: "overview",
  extraction_campuses: "campuses",
  extraction_agents: "agents",
  extraction_intakes: "intakes",
  extraction_course_fees: "fees",
  extraction_eligibility_requirements: "eligibility",
  extraction_study_units: "study_units",
  extraction_accreditations: "accreditations",
  extraction_study_options: "study_options",
  extraction_visa_services: "visa_service_extraction",
};

/**
 * Columns whose edits are saved and recorded like any other, but never turned into a lesson for
 * the extractor (see the loop below).
 *
 * `custom_dates` USED to qualify because nothing scraped it. The intake prompts now do, so that
 * premise is gone — but it stays here for the reason the loop's own comment gives: a lesson mints
 * `example_good` from the corrected VALUE, and these values are institution-specific dates. A
 * lesson reading "use the corrected pattern" with one university's exam date attached is how a
 * date gets reproduced for a university that never published it. What the extractor needed to
 * learn about this field belongs in the prompt, where it now is, not in per-domain guidance
 * carrying a live date.
 */
const NON_TEACHABLE_FIELDS = new Set(["custom_dates"]);


/** Intake columns holding a date, and so subject to the partial-date contract. */
const INTAKE_DATE_KEYS = ["start_date", "end_date", "orientation_date", "admission_deadline"] as const;

/**
 * Brings an admin's intake patch onto the stored contract, in place.
 *
 * Accepts what a person would type as well as what the form sends, but refuses anything that is
 * neither — a silent null here would look like the admin cleared a field they had just filled in.
 */
function normaliseIntakePatch(patch: Record<string, unknown>): void {
  for (const key of INTAKE_DATE_KEYS) {
    if (!(key in patch)) continue;
    const raw = patch[key];
    if (raw == null || raw === "") { patch[key] = null; continue; }
    const value = coercePartialDate(raw);
    if (!value) throw new BadRequestError(`${key} must be a date (YYYY-MM-DD) or a month (YYYY-MM)`);
    patch[key] = value;
  }
  if ("custom_dates" in patch && patch.custom_dates != null) {
    const parsed = z.array(IntakeCustomDateSchema).safeParse(patch.custom_dates);
    if (!parsed.success) throw new BadRequestError("Each custom date needs a name and a date (YYYY-MM-DD or YYYY-MM)");
    patch.custom_dates = JSON.stringify(parsed.data);
  }
}


/**
 * Brings an admin's eligibility patch onto the stored contract, in place.
 *
 * `patch` is validated only as z.record(z.unknown()), so without this the test arrays reach the
 * column unchecked. A nameless test is the one that matters: `sameTest` in the verdict engine
 * matches on name, so an entry with none can never match a student's test and instead emits a
 * permanently `unknown` criterion, capping a real student's eligibility percentage below 100 and
 * rendering as a tile labelled "Test". The extraction writers already drop those
 * (normaliseAcademicTests); this is the admin path that bypassed them.
 *
 * score_type is checked against the same four values as the column's CHECK, so a bad one is a 400
 * naming the field rather than a constraint violation surfacing as a 500.
 */
function normaliseEligibilityPatch(patch: Record<string, unknown>): void {
  for (const [key, schema] of [
    ["academic_tests", AcademicTestSchema],
    ["language_tests", LanguageTestSchema],
  ] as const) {
    if (!(key in patch) || patch[key] == null) continue;
    const parsed = z.array(schema).safeParse(patch[key]);
    if (!parsed.success) {
      throw new BadRequestError(`${key}: every entry needs a test name; scores must be text or numbers`);
    }
    patch[key] = JSON.stringify(parsed.data);
  }
  if ("score_type" in patch && patch.score_type != null && patch.score_type !== "") {
    if (!z.enum(SCORE_TYPES).safeParse(patch.score_type).success) {
      throw new BadRequestError(`score_type must be one of ${SCORE_TYPES.join(", ")}`);
    }
  }
}

export async function saveAndLearn(input: SaveAndLearnInput, adminId: number) {
  const { table, id, patch, job_id, source_url } = input;

  // Phase 1: patch the row
  const original = await repo.findEntityRow(table, id);
  if (!original) throw new NotFoundError(`Row not found in ${table}`);

  // The inline field edits in the Intakes tab come through here, and `patch` is validated only as
  // z.record(z.unknown()) — so without this an admin's date goes to Postgres unchecked and trips
  // the column's CHECK constraint as a 500 instead of a 400 naming the field. Also normalises, so
  // typing "September 2026" is accepted and stored as the month it is.
  if (table === "extraction_intakes") normaliseIntakePatch(patch);
  if (table === "extraction_eligibility_requirements") normaliseEligibilityPatch(patch);

  await repo.patchEntityRow(table, id, patch, adminId);

  // Re-derive an intake's month/year when the admin corrects the name or start date.
  //
  // intake_month/intake_year are what the year filter, the "next intake" badge, the year facet
  // and institution search all read, and the Intakes tab does not expose them as fields — so an
  // admin renaming "Fall" to "Fall 2027" would fix the label and leave the intake invisible to
  // every one of those. Same helper the writers use, so a hand edit and a scrape agree.
  if (table === "extraction_intakes" && ("intake_name" in patch || "start_date" in patch)) {
    const row = await repo.findEntityRow(table, id);
    if (row) {
      // normaliseStored, not new Date(...).toISOString(): a stored "2026-09" through Date becomes
      // "2026-09-01", which is the invented day this whole change removes — reintroduced on the
      // admin save path, where it would be hardest to notice.
      const start = normaliseStored(row.start_date);
      // Re-derived from the corrected name/date, NOT from the stored month/year. The helper only
      // fills blanks, so feeding the old values back in made a correction a no-op: renaming
      // "Fall 2026" to "Fall 2027" left intake_year at 2026, and the intake went on being
      // filtered, grouped and advertised under the year the admin had just fixed.
      //
      // An admin who edits intake_month/intake_year in the same patch still wins — their value is
      // passed through as the seed. And a rename that yields nothing derivable ("Fall" -> "Autumn")
      // keeps what was already there rather than nulling a good value.
      const seed = (field: "intake_month" | "intake_year") =>
        field in patch ? (row[field] as number | null) : null;
      const fresh = deriveIntakeMonthYear(row.intake_name, start, seed("intake_month"), seed("intake_year"));
      const derived = {
        intake_month: fresh.intake_month ?? (row.intake_month as number | null),
        intake_year: fresh.intake_year ?? (row.intake_year as number | null),
      };
      if (derived.intake_month !== row.intake_month || derived.intake_year !== row.intake_year) {
        await repo.patchEntityRow(table, id, derived, adminId);
      }
    }
  }

  // Derive domain from source_url or job's institution_url
  let domain = "unknown";
  if (source_url) {
    try { domain = new URL(source_url).hostname.replace(/^www\./, ""); } catch { /* keep unknown */ }
  } else if (job_id) {
    const jobUrl = await repo.getJobUrl(job_id);
    if (jobUrl) {
      try { domain = new URL(jobUrl).hostname.replace(/^www\./, ""); } catch { /* keep unknown */ }
    }
  }

  // Phase 2: record in extraction_memory
  await repo.insertMemory({
    job_id: job_id ?? null,
    domain,
    step: TABLE_TO_STEP[table] ?? table,
    entity_type: table,
    entity_ref: id,
    source_url: source_url ?? null,
    ai_output: JSON.stringify(original),
    final_output: JSON.stringify({ ...original, ...patch }),
    diff: JSON.stringify(patch),
  });

  // V3 fix for V2 bug B2: save-and-learn now writes audit log
  await logAudit(adminId, "SAVE_AND_LEARN", {
    entityType: table,
    entityId: id,
    details: { patch_keys: Object.keys(patch) },
  });

  // Phase 3: auto-create lesson if ≥2 corrections on same domain+step+field
  // Ported from V2 extraction-memory "learn" action
  const step = TABLE_TO_STEP[table] ?? table;
  for (const field of Object.keys(patch)) {
    // Some fields cannot teach the extractor anything useful, even when it does produce them.
    // The lesson this loop would mint after the second edit reads "admin has corrected
    // custom_dates 2+ times on x.edu — use the corrected pattern", with one intake's exam dates
    // as `example_good`, and that text goes into the extraction prompt as domain guidance.
    // Teaching the LLM one institution's live date is how a fabricated date reaches another's
    // page. The correction is still recorded in extraction_memory above as provenance.
    if (NON_TEACHABLE_FIELDS.has(field)) continue;
    const correctionCount = await masterKnex(`${S}.extraction_memory`)
      .where({ domain, step, entity_type: table })
      .whereRaw(`diff::text LIKE ?`, [`%"${field}"%`])
      .count("id as count")
      .first();

    if (Number(correctionCount?.count) >= 2) {
      // Check if lesson already exists for this domain+step+field
      const existing = await masterKnex(`${S}.extraction_lessons`)
        .where({ domain, step, scope: "domain" })
        .whereRaw(`rule LIKE ?`, [`%${field}%`])
        .first();

      if (!existing) {
        const beforeVal = original[field] != null ? String(original[field]) : null;
        const afterVal = patch[field] != null ? String(patch[field]) : null;

        await masterKnex(`${S}.extraction_lessons`).insert({
          scope: "domain",
          domain,
          step,
          rule: `For "${field}": admin has corrected this field ${correctionCount?.count}+ times on ${domain}. Use the corrected pattern.`,
          example_bad: beforeVal,
          example_good: afterVal,
          source: "auto_learned",
          weight: 2,
          is_active: true,
        });
        logger.info("Auto-created lesson from corrections", { domain, step, field, corrections: correctionCount?.count });
      }
    }
  }

  return { success: true };
}
