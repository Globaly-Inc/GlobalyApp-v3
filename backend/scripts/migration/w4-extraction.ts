/**
 * W4 — the extraction corpus (Part 3 §4 W4, §15 decisions 3 and 4).
 *
 * §4 W4 opens with "first: check whether it's already there". It was not: the dev
 * database was rebuilt after the rehearsal, so every superadmin.extraction_* table
 * measured 0 rows on 2026-08-17 and this wave is a LOAD, not a delta upsert. The
 * loader is written as a delta anyway — natural-key upserts on the preserved V1
 * uuid — so a second run, or a re-run after a partial cutover, converges instead
 * of duplicating.
 *
 * What makes this wave cheap: V3's extraction schema is V1's, unchanged. The uuid
 * primary keys are PRESERVED, so `id` is both the identity Gate 2 compares on and
 * the conflict target that makes the load idempotent. Only six shapes actually
 * moved, and each one is spelled out below as an override rather than hidden in a
 * cast:
 *
 *   extraction_jobs.business_category_id / .service_category_id  uuid -> serial
 *   extraction_course_fees.fee_type_id                           uuid -> serial
 *   extraction_eligibility_requirements.degree_level_id          uuid -> serial
 *   extraction_courses.*_fee_installments                        text -> jsonb
 *   extraction_mara_agents.promoted_business_id                  uuid -> serial
 *   ai_knowledge_*.{added_by,created_by,verified_by}             uuid -> serial
 *
 * §15 decision 3: every reference id resolves against the `public` vocabularies —
 * public.fee_types, public.degree_levels, public.business_categories,
 * public.service_categories. The superadmin.* copies are views onto public now;
 * the placeholder tables were an abandoned artifact and resolving against them
 * would key this corpus to something that is not the canonical vocabulary.
 *
 * §15 decision 4, honoured from the ledger, not re-decided here:
 *   scrape_smoke_results    32,120 rows of CI junk — the table does not migrate.
 *   extraction_job_events   the TABLE migrates, its V1 ROWS do not. superadmin.
 *                           extraction_job_events is live: the workers write it and
 *                           GET /jobs/:id/events reads it. Loading a dead job
 *                           history would interleave into a live timeline.
 * Neither is touched by this file. Both carry `disposition: "drop"` with a reason
 * code in mapping.json, which is where Gate 2 reads them.
 *
 * EMBEDDINGS ARE NEVER COPIED. V1 stores them as text (1536 dims, OpenAI); V3
 * declares vector(3072) and re-embeds with its own model. A vector from a
 * different model is not merely differently sized — cosine distance cannot compare
 * it, so a widened copy would be silently wrong rather than loudly missing. The
 * rows load with a NULL embedding and are re-embedded in wave E1;
 * memory-client.ts already treats a missing embedding as non-fatal. Declared in
 * mapping.json `dropped[]` with that reason, so the omission is in the manifest
 * rather than in someone's memory.
 *
 * The 7 course junctions load LAST, each behind assertParentCounts (defect D8).
 *
 * Usage:
 *   node --import tsx scripts/migration/w4-extraction.ts --self-check
 *   node --import tsx scripts/migration/w4-extraction.ts             # dry run
 *   node --import tsx scripts/migration/w4-extraction.ts --apply
 */

import assert from "node:assert/strict";

import {
  assertParentCounts,
  clearReport,
  execWrite,
  intersectColumns,
  qualify,
  quoteIdent,
  reportUnresolvedQuery,
  runTransform,
  STAGING_SCHEMA,
  tableColumns,
  unmappedColumns,
  type TransformContext,
} from "./lib.js";

// ── Reference resolvers (§15 decision 3: `public`, never the superadmin copies) ──

/** V1 business_categories uuid -> public.business_categories serial, via the slug. */
export const BUSINESS_CATEGORY_ID = (col: string): string =>
  `(SELECT bc.id FROM ${STAGING_SCHEMA}.business_categories vbc
      JOIN public.business_categories bc ON bc.slug = vbc.slug AND bc.deleted_at IS NULL
     WHERE vbc.id = ${col})`;

/** V1 service_categories uuid -> public.service_categories serial, via the slug. */
export const SERVICE_CATEGORY_ID = (col: string): string =>
  `(SELECT sc.id FROM ${STAGING_SCHEMA}.service_categories vsc
      JOIN public.service_categories sc ON sc.slug = vsc.slug AND sc.deleted_at IS NULL
     WHERE vsc.id = ${col})`;

/**
 * V1 fee_types uuid -> public.fee_types serial.
 *
 * public.fee_types has no slug UNIQUE — its natural key is the partial expression
 * index on lower(name) for live rows, which is exactly the key W2 upserted on. So
 * this join has to use the same key, or W2 and W4 would disagree about what a fee
 * type is.
 */
export const FEE_TYPE_ID = (col: string): string =>
  `(SELECT pf.id FROM ${STAGING_SCHEMA}.fee_types ft
      JOIN public.fee_types pf ON lower(btrim(pf.name)) = lower(btrim(ft.name)) AND pf.deleted_at IS NULL
     WHERE ft.id = ${col})`;

/** V1 degree_levels uuid -> public.degree_levels serial, via the slug. */
export const DEGREE_LEVEL_ID = (col: string): string =>
  `(SELECT pd.id FROM ${STAGING_SCHEMA}.degree_levels d
      JOIN public.degree_levels pd ON pd.slug = d.slug
     WHERE d.id = ${col})`;

/** V1 business uuid -> public.businesses serial, through the W1 resolver view. */
export const BUSINESS_ID = (col: string): string =>
  `(SELECT mb.business_id FROM mig.map_businesses mb WHERE mb.v1_business_id = ${col})`;

/** V1 auth uuid -> public.platform_users serial, through the W1 identity map. */
export const PLATFORM_USER_ID = (col: string): string =>
  `(SELECT mu.platform_user_id FROM mig.map_users mu WHERE mu.v1_user_id = ${col})`;

/**
 * V1 auth uuid -> superadmin.admin_users serial.
 *
 * Two hops, and the second one can legitimately fail: a V1 user who was an admin
 * may not have an admin_users row in V3. That is an unresolved reference, not a
 * NULL — reported wherever it is used.
 */
export const ADMIN_USER_ID = (col: string): string =>
  `(SELECT au.id FROM mig.map_users mu
      JOIN superadmin.admin_users au ON au.platform_user_id = mu.platform_user_id
     WHERE mu.v1_user_id = ${col})`;

/**
 * V1 stored the fee-installment columns as free text and put prose in them
 * ("Payable in five installments"); V3 declares jsonb. A bare ::jsonb cast throws
 * on that prose, and dropping the column would lose the only note the extractor
 * captured about how the fee is paid. A JSON string IS valid jsonb, so text that
 * does not already look like JSON becomes one — lossless, and still queryable.
 */
export const TEXT_TO_JSONB = (col: string): string =>
  `(CASE WHEN ${col} IS NULL THEN NULL
         WHEN btrim(${col}) ~ '^[[{]' THEN ${col}::jsonb
         ELSE to_jsonb(${col}) END)`;

// ── The copier ──────────────────────────────────────────────────────────────

export interface CopySpec {
  /** Staging table name; also the target table name unless `targetTable` says otherwise. */
  table: string;
  targetTable?: string;
  targetSchema?: string;
  /** Natural key on the target. For this corpus it is `id` — V1's uuid, preserved. */
  conflict: string[];
  /** Target column -> SQL expression over the source alias `s`. Overrides the plain copy. */
  overrides?: Record<string, string>;
  /** Source columns deliberately not carried. Each one is declared in mapping.json `dropped[]`. */
  never?: readonly string[];
  /** Restricts the source population. Rows it excludes must already be reason-coded. */
  where?: string;
}

/**
 * Copy one staged table into V3, shape discovered at run time (convention 2).
 *
 * The column list is the INTERSECTION of the two live tables plus whatever the
 * spec overrides, so a column added on either side does not silently vanish: what
 * the target has no home for lands in the run notes, and mapping.json's coverage
 * rule turns it into a red gate at verification time.
 */
export async function copyTable(ctx: TransformContext, spec: CopySpec): Promise<number> {
  const targetSchema = spec.targetSchema ?? "superadmin";
  const targetTable = spec.targetTable ?? spec.table;
  const target = qualify(targetSchema, targetTable);

  const srcCols = await tableColumns(ctx.db, STAGING_SCHEMA, spec.table);
  const tgtCols = await tableColumns(ctx.db, targetSchema, targetTable);
  const never = new Set(spec.never ?? []);

  const overrides = spec.overrides ?? {};
  const columns = intersectColumns([...srcCols].sort(), tgtCols, never);
  for (const c of Object.keys(overrides)) {
    if (!tgtCols.has(c)) throw new Error(`${target} has no column ${c} — the override and the schema have drifted`);
    if (!columns.includes(c)) columns.push(c);
  }
  columns.sort();

  const orphaned = unmappedColumns([...srcCols].sort(), tgtCols, never);
  if (orphaned.length) {
    ctx.report.notes.push(`${spec.table}: ${orphaned.length} source column(s) with no V3 home — ${orphaned.join(", ")}`);
  }

  for (const key of spec.conflict) {
    if (!columns.includes(key)) throw new Error(`${target}: conflict column ${key} is not being inserted`);
  }

  const select = columns.map((c) => `${overrides[c] ?? `s.${quoteIdent(c)}`} AS ${quoteIdent(c)}`).join(", ");
  const updates = columns.filter((c) => !spec.conflict.includes(c));
  const action = updates.length
    ? `DO UPDATE SET ${updates.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(", ")}`
    : "DO NOTHING";

  return execWrite(
    ctx,
    target,
    `INSERT INTO ${target} (${columns.map(quoteIdent).join(", ")})
     SELECT ${select} FROM ${qualify(STAGING_SCHEMA, spec.table)} s
     ${spec.where ? `WHERE ${spec.where}` : ""}
     ON CONFLICT (${spec.conflict.map(quoteIdent).join(", ")}) ${action}`,
  );
}

/**
 * Source columns this wave deliberately does not carry, per table.
 *
 * Named here rather than inline so the self-check can assert on a value instead
 * of scraping a function body, and so the list reads against mapping.json's
 * `dropped[]` — which is where Gate 2 enforces that every one of them has a
 * written reason.
 */
export const NEVER_COPIED: Readonly<Record<string, readonly string[]>> = {
  extraction_memory: ["embedding"],
  ai_knowledge_documents: ["embedding", "embedded_at", "embedded_hash"],
  ai_knowledge_faqs: ["embedding"],
  ai_knowledge_visa: ["embedding"],
  ai_knowledge_country_guides: ["embedding"],
  ai_knowledge_categories: ["crawl_rules"],
};

/** The 7 course junctions, and the parent each one hangs off besides the course. */
const JUNCTIONS: readonly { table: string; other: { label: string; stagingTable: string; targetTable: string } }[] = [
  {
    table: "extraction_course_campuses",
    other: { label: "extraction_campuses", stagingTable: "extraction_campuses", targetTable: "superadmin.extraction_campuses" },
  },
  {
    table: "extraction_course_eligibility_assignments",
    other: {
      label: "extraction_eligibility_requirements",
      stagingTable: "extraction_eligibility_requirements",
      targetTable: "superadmin.extraction_eligibility_requirements",
    },
  },
  {
    table: "extraction_course_fee_assignments",
    other: { label: "extraction_course_fees", stagingTable: "extraction_course_fees", targetTable: "superadmin.extraction_course_fees" },
  },
  {
    table: "extraction_course_intake_assignments",
    other: { label: "extraction_intakes", stagingTable: "extraction_intakes", targetTable: "superadmin.extraction_intakes" },
  },
  {
    table: "extraction_course_study_option_assignments",
    other: { label: "extraction_study_options", stagingTable: "extraction_study_options", targetTable: "superadmin.extraction_study_options" },
  },
  {
    table: "extraction_course_study_unit_assignments",
    other: { label: "extraction_study_units", stagingTable: "extraction_study_units", targetTable: "superadmin.extraction_study_units" },
  },
  {
    table: "extraction_course_accreditation_assignments",
    other: {
      label: "extraction_accreditations",
      stagingTable: "extraction_accreditations",
      targetTable: "superadmin.extraction_accreditations",
    },
  },
];

/** Every V1 table this wave reads, so a re-run replaces its verdict instead of appending one. */
export const W4_SOURCE_TABLES: readonly string[] = [
  "extraction_jobs",
  "extraction_course_fees",
  "extraction_eligibility_requirements",
  "extraction_mara_agents",
  "ai_knowledge_sources",
  "ai_knowledge_faqs",
  "ai_knowledge_visa",
  "data_verification_queue",
];

export async function transformExtraction(ctx: TransformContext, allowedCodes: ReadonlySet<string>): Promise<void> {
  await clearReport(ctx, W4_SOURCE_TABLES);

  // ── extraction_jobs — everything else hangs off it via job_id ──────────────
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "extraction_jobs",
    targetTable: "superadmin.extraction_jobs",
    column: "business_category_id",
    reasonCode: "unresolved_category",
    sql: `SELECT s.id::text, 'business_category ' || s.business_category_id::text || ' has no public.business_categories row'
            FROM ${STAGING_SCHEMA}.extraction_jobs s
           WHERE s.business_category_id IS NOT NULL AND ${BUSINESS_CATEGORY_ID("s.business_category_id")} IS NULL`,
  });
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "extraction_jobs",
    targetTable: "superadmin.extraction_jobs",
    column: "service_category_id",
    reasonCode: "unresolved_category",
    sql: `SELECT s.id::text, 'service_category ' || s.service_category_id::text || ' has no public.service_categories row'
            FROM ${STAGING_SCHEMA}.extraction_jobs s
           WHERE s.service_category_id IS NOT NULL AND ${SERVICE_CATEGORY_ID("s.service_category_id")} IS NULL`,
  });
  await copyTable(ctx, {
    table: "extraction_jobs",
    conflict: ["id"],
    overrides: {
      business_category_id: BUSINESS_CATEGORY_ID("s.business_category_id"),
      service_category_id: SERVICE_CATEGORY_ID("s.service_category_id"),
    },
  });

  // ── job-less roots ─────────────────────────────────────────────────────────
  await copyTable(ctx, { table: "extraction_site_profiles", conflict: ["domain"] });
  await copyTable(ctx, { table: "extraction_lessons", conflict: ["id"] });
  await copyTable(ctx, { table: "extraction_accreditations", conflict: ["id"] });

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "extraction_mara_agents",
    targetTable: "superadmin.extraction_mara_agents",
    column: "promoted_business_id",
    reasonCode: "unresolved_business",
    sql: `SELECT s.id::text, 'promoted business ' || s.promoted_business_id::text || ' did not migrate to public.businesses'
            FROM ${STAGING_SCHEMA}.extraction_mara_agents s
           WHERE s.promoted_business_id IS NOT NULL AND ${BUSINESS_ID("s.promoted_business_id")} IS NULL`,
  });
  await copyTable(ctx, {
    table: "extraction_mara_agents",
    conflict: ["id"],
    overrides: { promoted_business_id: BUSINESS_ID("s.promoted_business_id") },
  });

  await copyTable(ctx, { table: "extraction_visas", conflict: ["id"] });

  // ── job children ───────────────────────────────────────────────────────────
  await copyTable(ctx, {
    table: "extraction_courses",
    conflict: ["id"],
    overrides: {
      domestic_fee_installments: TEXT_TO_JSONB("s.domestic_fee_installments"),
      international_fee_installments: TEXT_TO_JSONB("s.international_fee_installments"),
    },
  });
  await copyTable(ctx, { table: "extraction_campuses", conflict: ["id"] });
  await copyTable(ctx, { table: "extraction_agents", conflict: ["id"] });
  await copyTable(ctx, { table: "extraction_additional_info", conflict: ["id"] });
  await copyTable(ctx, { table: "extraction_institution_overview", conflict: ["id"] });
  await copyTable(ctx, { table: "extraction_queue", conflict: ["id"] });
  await copyTable(ctx, { table: "extraction_site_intelligence", conflict: ["id"] });
  await copyTable(ctx, { table: "extraction_study_options", conflict: ["id"] });
  await copyTable(ctx, { table: "extraction_study_units", conflict: ["id"] });

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "extraction_eligibility_requirements",
    targetTable: "superadmin.extraction_eligibility_requirements",
    column: "degree_level_id",
    reasonCode: "unresolved_parent",
    sql: `SELECT s.id::text, 'degree_level ' || s.degree_level_id::text || ' has no public.degree_levels row'
            FROM ${STAGING_SCHEMA}.extraction_eligibility_requirements s
           WHERE s.degree_level_id IS NOT NULL AND ${DEGREE_LEVEL_ID("s.degree_level_id")} IS NULL`,
  });
  await copyTable(ctx, {
    table: "extraction_eligibility_requirements",
    conflict: ["id"],
    overrides: { degree_level_id: DEGREE_LEVEL_ID("s.degree_level_id") },
  });

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "extraction_course_fees",
    targetTable: "superadmin.extraction_course_fees",
    column: "fee_type_id",
    reasonCode: "unresolved_parent",
    sql: `SELECT s.id::text, 'fee_type ' || s.fee_type_id::text || ' has no public.fee_types row'
            FROM ${STAGING_SCHEMA}.extraction_course_fees s
           WHERE s.fee_type_id IS NOT NULL AND ${FEE_TYPE_ID("s.fee_type_id")} IS NULL`,
  });
  await copyTable(ctx, {
    table: "extraction_course_fees",
    conflict: ["id"],
    overrides: { fee_type_id: FEE_TYPE_ID("s.fee_type_id") },
  });

  // The embedding is NOT carried: V1 text @1536 (OpenAI) vs V3 vector(3072).
  // Wave E1 re-embeds; memory-client.ts treats a missing embedding as non-fatal.
  await copyTable(ctx, { table: "extraction_memory", conflict: ["id"], never: NEVER_COPIED.extraction_memory });

  await copyTable(ctx, { table: "extraction_agent_locations", conflict: ["id"] });
  await copyTable(ctx, { table: "extraction_intakes", conflict: ["id"] });
  await copyTable(ctx, { table: "extraction_english_requirements", conflict: ["id"] });
  await copyTable(ctx, { table: "extraction_verification_results", conflict: ["id"] });

  await copyTable(ctx, { table: "agent_extraction_runs", conflict: ["id"] });
  await copyTable(ctx, {
    table: "agent_extraction_schedule",
    conflict: ["id"],
    overrides: { cadence: "s.cadence::superadmin.agent_extraction_cadence" },
  });

  // ── the 7 course junctions, last, behind the D8 guard ──────────────────────
  for (const j of JUNCTIONS) {
    await assertParentCounts(ctx, `superadmin.${j.table}`, [
      { label: "extraction_courses", stagingTable: "extraction_courses", targetTable: "superadmin.extraction_courses" },
      j.other,
    ]);
    await copyTable(ctx, { table: j.table, conflict: ["id"] });
  }

  // ── AI knowledge base (§4 W4; same wave, own dependency order) ─────────────
  await copyTable(ctx, { table: "ai_knowledge_categories", conflict: ["id"], never: NEVER_COPIED.ai_knowledge_categories });

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "ai_knowledge_sources",
    targetTable: "superadmin.ai_knowledge_sources",
    column: "added_by",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'added_by ' || s.added_by::text || ' has no superadmin.admin_users row'
            FROM ${STAGING_SCHEMA}.ai_knowledge_sources s
           WHERE s.added_by IS NOT NULL AND ${ADMIN_USER_ID("s.added_by")} IS NULL`,
  });
  await copyTable(ctx, {
    table: "ai_knowledge_sources",
    conflict: ["id"],
    overrides: { added_by: ADMIN_USER_ID("s.added_by") },
  });

  await copyTable(ctx, { table: "ai_knowledge_documents", conflict: ["id"], never: NEVER_COPIED.ai_knowledge_documents });

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "ai_knowledge_faqs",
    targetTable: "superadmin.ai_knowledge_faqs",
    column: "created_by",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'created_by ' || s.created_by::text || ' has no superadmin.admin_users row'
            FROM ${STAGING_SCHEMA}.ai_knowledge_faqs s
           WHERE s.created_by IS NOT NULL AND ${ADMIN_USER_ID("s.created_by")} IS NULL`,
  });
  await copyTable(ctx, {
    table: "ai_knowledge_faqs",
    conflict: ["id"],
    never: NEVER_COPIED.ai_knowledge_faqs,
    overrides: { created_by: ADMIN_USER_ID("s.created_by") },
  });

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "ai_knowledge_visa",
    targetTable: "superadmin.ai_knowledge_visa",
    column: "verified_by",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'verified_by ' || s.verified_by::text || ' has no superadmin.admin_users row'
            FROM ${STAGING_SCHEMA}.ai_knowledge_visa s
           WHERE s.verified_by IS NOT NULL AND ${ADMIN_USER_ID("s.verified_by")} IS NULL`,
  });
  await copyTable(ctx, {
    table: "ai_knowledge_visa",
    conflict: ["id"],
    never: NEVER_COPIED.ai_knowledge_visa,
    overrides: { verified_by: ADMIN_USER_ID("s.verified_by") },
  });

  await copyTable(ctx, { table: "ai_knowledge_country_guides", conflict: ["id"], never: NEVER_COPIED.ai_knowledge_country_guides });

  // data_verification_queue.submitted_by is NOT NULL on both sides, so a
  // submitter that does not resolve makes the row unloadable — skipped and
  // reason-coded, never defaulted onto some other admin.
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "data_verification_queue",
    targetTable: "superadmin.data_verification_queue",
    column: "submitted_by",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'submitted_by ' || s.submitted_by::text || ' has no public.platform_users row'
            FROM ${STAGING_SCHEMA}.data_verification_queue s
           WHERE ${PLATFORM_USER_ID("s.submitted_by")} IS NULL`,
  });
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "data_verification_queue",
    targetTable: "superadmin.data_verification_queue",
    column: "reviewed_by",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'reviewed_by ' || s.reviewed_by::text || ' has no superadmin.admin_users row'
            FROM ${STAGING_SCHEMA}.data_verification_queue s
           WHERE s.reviewed_by IS NOT NULL AND ${ADMIN_USER_ID("s.reviewed_by")} IS NULL`,
  });
  await copyTable(ctx, {
    table: "data_verification_queue",
    conflict: ["id"],
    where: `${PLATFORM_USER_ID("s.submitted_by")} IS NOT NULL`,
    overrides: {
      submitted_by: PLATFORM_USER_ID("s.submitted_by"),
      reviewed_by: ADMIN_USER_ID("s.reviewed_by"),
    },
  });
}

export function extractionSelfCheck(): void {
  // §15 decision 3 — the reference ids resolve against public, not the superadmin
  // views. Getting this wrong keys 17,037 courses to an abandoned vocabulary.
  for (const resolver of [BUSINESS_CATEGORY_ID, SERVICE_CATEGORY_ID, FEE_TYPE_ID, DEGREE_LEVEL_ID]) {
    const sql = resolver("x");
    assert.ok(sql.includes("public."), "reference ids resolve against public");
    assert.ok(!/superadmin\./.test(sql), "never against the superadmin copies (§15 decision 3)");
  }
  // fee_types has no slug UNIQUE; W2 upserted on lower(name) and so must this.
  assert.ok(FEE_TYPE_ID("x").includes("lower(btrim("), "fee types join on the key W2 loaded them under");
  assert.ok(BUSINESS_ID("x").includes("mig.map_businesses"), "businesses resolve through the W1 view");
  assert.ok(PLATFORM_USER_ID("x").includes("mig.map_users"), "users resolve through the W1 identity map");
  assert.ok(ADMIN_USER_ID("x").includes("superadmin.admin_users"), "admin references land on admin_users, not platform_users");

  // No resolver may invent a default: an unresolved reference is NULL + a report.
  for (const resolver of [BUSINESS_CATEGORY_ID, SERVICE_CATEGORY_ID, FEE_TYPE_ID, DEGREE_LEVEL_ID, BUSINESS_ID, PLATFORM_USER_ID, ADMIN_USER_ID]) {
    assert.ok(!resolver("x").includes("coalesce"), "an unresolved reference is reported, never defaulted");
  }

  // The prose-in-a-jsonb-column problem: V1 put "Payable in five installments" in
  // a text column V3 declares jsonb. A bare cast throws; a JSON string does not.
  const j = TEXT_TO_JSONB("s.c");
  assert.ok(j.includes("to_jsonb("), "non-JSON text becomes a JSON string rather than throwing or being dropped");
  assert.ok(j.includes("::jsonb"), "text that already is JSON is parsed, not double-encoded");
  assert.ok(j.includes("IS NULL THEN NULL"), "NULL stays NULL, not the JSON literal null");

  // All 7 course junctions, each declaring the parent it hangs off besides the
  // course itself. Losing one here loses the D8 guard silently.
  assert.equal(JUNCTIONS.length, 7, "§4 W4: seven junctions, loaded last");
  assert.equal(new Set(JUNCTIONS.map((x) => x.table)).size, 7);
  for (const j2 of JUNCTIONS) assert.ok(j2.other.targetTable.startsWith("superadmin."), "junction parents live in superadmin");

  // The two dispositions §15 decision 4 settled must not be loaded by this wave.
  const body = transformExtraction.toString();
  assert.ok(!body.includes("scrape_smoke_results"), "32,120 rows of CI junk do not migrate");
  assert.ok(!body.includes("extraction_job_events"), "the table migrates; its V1 rows do not (V3 table is live)");
  // Embeddings are never copied — a vector from a different model is incomparable,
  // so every table carrying one must name it here.
  for (const t of ["extraction_memory", "ai_knowledge_documents", "ai_knowledge_faqs", "ai_knowledge_visa", "ai_knowledge_country_guides"]) {
    assert.ok(NEVER_COPIED[t]?.includes("embedding"), `${t}: the embedding must not be copied`);
  }

  console.log("w4-extraction self-check: ok");
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await runTransform({ wave: "W4-extraction", body: transformExtraction, selfCheck: extractionSelfCheck }));
}
