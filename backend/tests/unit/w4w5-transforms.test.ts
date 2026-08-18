// W4 (extraction corpus) and W5 (content & config) — the halves that can be
// checked without a database.
//
// The interesting failures in these two waves are not SQL errors; they are quiet
// semantic ones. A reference id resolved against the wrong vocabulary, an actor
// attributed to the wrong integer id space, an embedding copied between two
// models whose vectors cannot be compared, a fact dropped because its column had
// no home. Each of those still loads cleanly and is wrong. So each of them gets
// an assertion here, where it fails in CI rather than at --apply.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ADMIN_USER_ID,
  BUSINESS_CATEGORY_ID,
  DEGREE_LEVEL_ID,
  FEE_TYPE_ID,
  NEVER_COPIED,
  PLATFORM_USER_ID,
  SERVICE_CATEGORY_ID,
  TEXT_TO_JSONB,
  extractionSelfCheck,
} from "../../scripts/migration/w4-extraction.js";
import { AUDIT_DETAILS, contentSelfCheck } from "../../scripts/migration/w5-content.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(readFileSync(path.join(HERE, "../../scripts/migration/mapping.json"), "utf8")) as {
  meta: { reasonCodes: Record<string, string> };
  tables: Record<string, { disposition: string; wave?: string; reasonCode?: string; targets?: string[] }>;
  mappings: { name: string; source: { table: string }; junction?: { parents: string[] } }[];
};

const sourceTable = (m: { source: { table: string } }): string => m.source.table.replace(/^v1_staging\./, "");
const mappedTables = new Set(MANIFEST.mappings.map(sourceTable));
const inWave = (wave: string): [string, { disposition: string; reasonCode?: string }][] =>
  Object.entries(MANIFEST.tables).filter(([, e]) => (e as { wave?: string }).wave === wave);

describe("W4/W5 transform self-checks", () => {
  it("w4-extraction --self-check passes", () => {
    expect(() => extractionSelfCheck()).not.toThrow();
  });

  it("w5-content --self-check passes", () => {
    expect(() => contentSelfCheck()).not.toThrow();
  });
});

describe("reference resolution stays on the canonical vocabulary (§15 decision 3)", () => {
  // The superadmin.* reference tables are views onto public now; the placeholder
  // tables were an abandoned artifact. Resolving 17,037 courses against them
  // would key the whole corpus to something that is not the vocabulary.
  it.each([
    ["business_categories", BUSINESS_CATEGORY_ID],
    ["service_categories", SERVICE_CATEGORY_ID],
    ["fee_types", FEE_TYPE_ID],
    ["degree_levels", DEGREE_LEVEL_ID],
  ])("%s resolves against public, never the superadmin copy", (_name, resolver) => {
    const sql = resolver("x");
    expect(sql).toContain("public.");
    expect(sql).not.toMatch(/superadmin\./);
  });

  it("fee types join on lower(name), the key W2 actually loaded them under", () => {
    // public.fee_types has no slug UNIQUE — its natural key is a partial
    // expression index on lower(name). Joining on anything else would make W2
    // and W4 disagree about what a fee type is.
    expect(FEE_TYPE_ID("x")).toContain("lower(btrim(");
  });

  it("no resolver invents a default for a reference that does not resolve", () => {
    for (const resolver of [BUSINESS_CATEGORY_ID, SERVICE_CATEGORY_ID, FEE_TYPE_ID, DEGREE_LEVEL_ID, PLATFORM_USER_ID, ADMIN_USER_ID]) {
      expect(resolver("x")).not.toContain("coalesce");
    }
  });

  it("keeps the two integer id spaces apart", () => {
    // Both are `integer`, and several columns carrying them have no FK to catch
    // a mix-up: an admin action attributes to admin_users, a product action to
    // platform_users.
    expect(ADMIN_USER_ID("x")).toContain("superadmin.admin_users");
    expect(PLATFORM_USER_ID("x")).toContain("mig.map_users");
    expect(ADMIN_USER_ID("x")).not.toEqual(PLATFORM_USER_ID("x"));
  });
});

describe("embeddings are never copied", () => {
  // V1 stores a 1536-dim OpenAI vector as text; V3 declares vector(3072) and
  // re-embeds with its own model in wave E1. A copied vector is not merely the
  // wrong width — cosine distance cannot compare it, so it would be silently
  // wrong instead of loudly missing.
  it.each([
    "extraction_memory",
    "ai_knowledge_documents",
    "ai_knowledge_faqs",
    "ai_knowledge_visa",
    "ai_knowledge_country_guides",
  ])("%s does not carry its embedding", (table) => {
    expect(NEVER_COPIED[table]).toContain("embedding");
  });

  it("every never-copied column is declared in the manifest with a reason", () => {
    for (const [table, columns] of Object.entries(NEVER_COPIED)) {
      const mapping = MANIFEST.mappings.find((m) => sourceTable(m) === table);
      expect(mapping, `${table} has no verification mapping`).toBeDefined();
      const dropped = (mapping as unknown as { dropped: { column: string; reason: string }[] }).dropped;
      for (const column of columns) {
        const entry = dropped.find((d) => d.column === column);
        expect(entry, `${table}.${column} is not carried and not declared dropped`).toBeDefined();
        expect(entry!.reason.length).toBeGreaterThan(20);
      }
    }
  });
});

describe("text -> jsonb, where V1 put prose in a column V3 types as jsonb", () => {
  const sql = TEXT_TO_JSONB("s.c");

  it("turns non-JSON text into a JSON string rather than throwing or dropping it", () => {
    // "Payable in five installments" is real V1 data. A bare ::jsonb cast throws
    // on it; a JSON string is valid jsonb and loses nothing.
    expect(sql).toContain("to_jsonb(");
  });

  it("parses text that already is JSON instead of double-encoding it", () => {
    expect(sql).toContain("::jsonb");
    expect(sql).toContain("'^[[{]'");
  });

  it("leaves NULL as NULL, not the JSON literal null", () => {
    expect(sql).toContain("IS NULL THEN NULL");
  });
});

describe("audit_events -> audit_logs keeps the facts V3 has no column for", () => {
  // public.audit_logs models an ACTION; V1's audit_events is an event pair with
  // an outcome and a user agent. details is jsonb precisely so a record can carry
  // what the columns do not.
  it.each(["v1_event_category", "v1_outcome", "v1_user_email", "v1_user_agent"])("folds %s into details", (key) => {
    expect(AUDIT_DETAILS).toContain(key);
  });

  it("leaves a row that had none of them byte-identical to its source details", () => {
    expect(AUDIT_DETAILS).toContain("jsonb_strip_nulls");
  });

  it("does not let a NULL details swallow the folded keys", () => {
    expect(AUDIT_DETAILS).toContain("coalesce(s.details");
  });
});

describe("the W4/W5 disposition ledger stays arithmetic", () => {
  const reasonCodes = new Set(Object.keys(MANIFEST.meta.reasonCodes).filter((k) => !k.startsWith("$")));

  it.each(["W4", "W5"])("every %s transform table has a verification mapping", (wave) => {
    const pending = inWave(wave)
      .filter(([t, e]) => e.disposition === "transform" && !mappedTables.has(t))
      .map(([t]) => t);
    expect(pending, `unverified ${wave} tables: ${pending.join(", ")}`).toEqual([]);
  });

  it.each(["W4", "W5"])("every %s drop carries a reason code from the closed enum", (wave) => {
    for (const [table, entry] of inWave(wave)) {
      if (entry.disposition !== "drop") continue;
      expect(entry.reasonCode, `${table} is dropped with no reason code`).toBeDefined();
      expect(reasonCodes.has(entry.reasonCode!), `${table}: unknown reason code ${entry.reasonCode}`).toBe(true);
    }
  });

  it("keeps the two §15 decision 4 drops dropped", () => {
    // 32,120 rows of scraper smoke-test output were never product data.
    expect(MANIFEST.tables.scrape_smoke_results.disposition).toBe("drop");
    expect(MANIFEST.tables.scrape_smoke_results.reasonCode).toBe("ci_junk");
    // The TABLE migrates; its V1 ROWS do not. superadmin.extraction_job_events is
    // live — the workers write it and GET /jobs/:id/events reads it — so loading
    // a dead job history would interleave into a live timeline.
    expect(MANIFEST.tables.extraction_job_events.disposition).toBe("drop");
    expect(MANIFEST.tables.extraction_job_events.reasonCode).toBe("v3_table_live");
  });

  it("leaves feed_comments blocked on wave D4", () => {
    // §4: a blocked mapping flips to `transform` only once its target schema
    // merges. D4 is being built now; until it lands this must not be loaded.
    expect(MANIFEST.tables.feed_comments.disposition).toBe("blocked");
    expect(mappedTables.has("feed_comments")).toBe(false);
  });

  it("guards all 7 extraction course junctions on both parents (defect D8)", () => {
    const junctions = MANIFEST.mappings.filter((m) => m.junction && sourceTable(m).startsWith("extraction_course_"));
    expect(junctions).toHaveLength(7);
    for (const j of junctions) {
      expect(j.junction!.parents).toHaveLength(2);
      expect(j.junction!.parents).toContain("extraction_courses");
      for (const parent of j.junction!.parents) {
        expect(MANIFEST.mappings.some((m) => m.name === parent), `${j.name}: parent ${parent} is not a mapping`).toBe(true);
      }
    }
  });
});
