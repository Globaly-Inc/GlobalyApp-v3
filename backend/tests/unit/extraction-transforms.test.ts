import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs migration helper, no type declarations by design.
import * as t from "../../database/scripts/extraction-transforms.mjs";

const {
  LOAD_PLAN,
  EVENTS_TABLE,
  EXCLUDED_TABLES,
  buildSelect,
  buildUpsert,
  chunk,
  ident,
  missingParents,
  normalizeCountry,
  rowsPerStatement,
  textToJsonb,
} = t as {
  LOAD_PLAN: { table: string; parents?: Record<string, string>; conflictKey?: string[] }[];
  EVENTS_TABLE: { table: string; parents?: Record<string, string> };
  EXCLUDED_TABLES: Record<string, string>;
  buildSelect: (schema: string, table: string, cols: string[], orderBy: string) => string;
  buildUpsert: (o: {
    schema: string;
    table: string;
    columns: string[];
    types: string[];
    conflictKey: string[];
    rowCount: number;
  }) => string;
  chunk: <T>(items: T[], size: number) => T[][];
  ident: (name: string) => string;
  missingParents: (spec: { parents?: Record<string, string> }, verified: Set<string>) => string[];
  normalizeCountry: (raw: unknown) => { value: string | null; changed: boolean; reason: string | null };
  rowsPerStatement: (columnCount: number, cap?: number) => number;
  textToJsonb: (raw: unknown) => { value: string | null; coerced: boolean };
};

describe("normalizeCountry", () => {
  it.each([
    ["INDIA", "India"],
    ["India", "India"],
    ["  india  ", "india"], // already lower-cased free text is left alone apart from trimming
    ["AUSTRALIA", "Australia"],
    ["PAPUA NEW GUINEA", "Papua New Guinea"],
    ["PHILIPPINES (THE)", "Philippines"],
    ["UNITED ARAB EMIRATES (THE)", "United Arab Emirates"],
  ])("cleans %j to %j", (input, expected) => {
    expect(normalizeCountry(input).value).toBe(expected);
  });

  it.each([
    ["VIET NAM", "Vietnam"],
    ["Viet Nam", "Vietnam"],
    ["Nam", "Vietnam"],
    ["KOREA (THE REPUBLIC OF)", "South Korea"],
    ["IRAN (ISLAMIC REPUBLIC OF)", "Iran"],
    ["LAO PEOPLE'S DEMOCRATIC REPUBLIC (THE)", "Laos"],
    ["TANZANIA, THE UNITED REPUBLIC OF", "Tanzania"],
    ["UNITED KINGDOM OF GREAT BRITAIN AND NORTHERN IRELAND (THE)", "United Kingdom"],
    ["TURKIYE", "Turkey"],
    ["Lanka", "Sri Lanka"],
  ])("maps the alias %j to %j", (input, expected) => {
    const result = normalizeCountry(input);
    expect(result.value).toBe(expected);
    expect(result.reason).toBe("alias");
  });

  it("reports a change only when the value actually moved", () => {
    expect(normalizeCountry("India").changed).toBe(false);
    expect(normalizeCountry("INDIA").changed).toBe(true);
  });

  it.each(["QLD", "SS89DE", "Bogota"])("leaves the non-country %j untouched and flags it", (input) => {
    const result = normalizeCountry(input);
    expect(result.value).toBe(input);
    expect(result.reason).toBe("not a country — left as-is");
  });

  it.each(["Bangladesh; India; Sri Lanka", "Multiple (India; Nepal; Philippines)"])(
    "keeps the whole multi-country string %j rather than losing data",
    (input) => {
      const result = normalizeCountry(input);
      expect(result.value).toBe(input);
      expect(result.reason).toBe("multi-value — left as-is");
    },
  );

  it("collapses internal whitespace", () => {
    expect(normalizeCountry("NEW   ZEALAND").value).toBe("New Zealand");
  });

  it.each([null, undefined, "", "   "])("turns the empty value %j into null", (input) => {
    expect(normalizeCountry(input).value).toBeNull();
  });
});

describe("textToJsonb", () => {
  it("passes valid JSON objects and arrays through untouched", () => {
    expect(textToJsonb('{"a":1}')).toEqual({ value: '{"a":1}', coerced: false });
    expect(textToJsonb("[1,2]")).toEqual({ value: "[1,2]", coerced: false });
  });

  it("wraps V1 prose as a JSON string so the sentence survives", () => {
    expect(textToJsonb("Payable in five installments").value).toBe('"Payable in five installments"');
  });

  it("treats a bare number from a prose column as prose, not a JSON number", () => {
    expect(textToJsonb("5")).toEqual({ value: '"5"', coerced: true });
  });

  it("maps null and blank to null", () => {
    expect(textToJsonb(null).value).toBeNull();
    expect(textToJsonb("   ").value).toBeNull();
  });
});

describe("batching", () => {
  it("keeps a statement under the bind-parameter cap", () => {
    expect(rowsPerStatement(30, 30_000)).toBe(1000);
    expect(rowsPerStatement(7, 30_000) * 7).toBeLessThanOrEqual(30_000);
  });

  it("never returns zero rows per statement, however wide the table", () => {
    expect(rowsPerStatement(40_000, 30_000)).toBe(1);
  });

  it("rejects a non-positive column count", () => {
    expect(() => rowsPerStatement(0)).toThrow();
  });

  it("splits without losing or duplicating items", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe("SQL builders", () => {
  it("rejects an identifier that did not come from the catalog", () => {
    expect(() => ident('x"; DROP TABLE y --')).toThrow(/unsafe identifier/);
    expect(ident("extraction_jobs")).toBe('"extraction_jobs"');
  });

  it("renders every source column as text so the transfer is type-exact", () => {
    expect(buildSelect("public", "extraction_jobs", ["id", "name"], "id")).toBe(
      'SELECT "id"::text AS "id", "name"::text AS "name" FROM "public"."extraction_jobs" ORDER BY "id"',
    );
  });

  it("casts every placeholder back to the V3 column type", () => {
    const sql = buildUpsert({
      schema: "superadmin",
      table: "extraction_memory",
      columns: ["id", "embedding"],
      types: ["uuid", "vector(1536)"],
      conflictKey: ["id"],
      rowCount: 2,
    });
    expect(sql).toContain("($1::uuid, $2::vector(1536)), ($3::uuid, $4::vector(1536))");
  });

  it("upserts on the preserved V1 identity so a re-run updates in place", () => {
    const sql = buildUpsert({
      schema: "superadmin",
      table: "extraction_jobs",
      columns: ["id", "name", "status"],
      types: ["uuid", "text", "text"],
      conflictKey: ["id"],
      rowCount: 1,
    });
    expect(sql).toContain('ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "status" = EXCLUDED."status"');
    expect(sql).toContain("RETURNING (xmax = 0) AS inserted");
  });

  it("keys extraction_site_profiles on its domain primary key", () => {
    const spec = LOAD_PLAN.find((s) => s.table === "extraction_site_profiles");
    expect(spec?.conflictKey).toEqual(["domain"]);
  });

  it("falls back to DO NOTHING when every column is part of the key", () => {
    const sql = buildUpsert({
      schema: "superadmin",
      table: "t",
      columns: ["id"],
      types: ["uuid"],
      conflictKey: ["id"],
      rowCount: 1,
    });
    expect(sql).toContain('ON CONFLICT ("id") DO NOTHING');
  });

  it("refuses a zero-row statement", () => {
    expect(() =>
      buildUpsert({ schema: "s", table: "t", columns: ["id"], types: ["uuid"], conflictKey: ["id"], rowCount: 0 }),
    ).toThrow();
  });
});

describe("LOAD_PLAN ordering", () => {
  it("declares every parent before the table that depends on it", () => {
    const seen = new Set<string>();
    for (const spec of LOAD_PLAN) {
      expect(missingParents(spec, seen)).toEqual([]);
      seen.add(spec.table);
    }
  });

  it("places all seven junction tables after both of their parents", () => {
    const junctions = LOAD_PLAN.filter((s) => Object.keys(s.parents ?? {}).length >= 3);
    expect(junctions.map((s) => s.table)).toEqual([
      "extraction_course_campuses",
      "extraction_course_eligibility_assignments",
      "extraction_course_fee_assignments",
      "extraction_course_intake_assignments",
      "extraction_course_study_option_assignments",
      "extraction_course_study_unit_assignments",
      "extraction_course_accreditation_assignments",
    ]);
  });

  it("puts extraction_intakes after extraction_courses — V3 gave it a real course FK", () => {
    const order = LOAD_PLAN.map((s) => s.table);
    expect(order.indexOf("extraction_intakes")).toBeGreaterThan(order.indexOf("extraction_courses"));
    expect(order.indexOf("extraction_agent_locations")).toBeGreaterThan(order.indexOf("extraction_agents"));
  });

  it("loads each table exactly once and keeps events out of the default plan", () => {
    const names = LOAD_PLAN.map((s) => s.table);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("extraction_job_events");
    expect(EVENTS_TABLE.table).toBe("extraction_job_events");
  });

  it("documents both deliberate exclusions", () => {
    expect(Object.keys(EXCLUDED_TABLES).sort()).toEqual(["extraction_job_events", "scrape_smoke_results"]);
  });
});

describe("vectorWidth", () => {
  const vectorWidth = (t as { vectorWidth: (formatType?: string | null) => string | null }).vectorWidth;

  it("reads the declared width of a pgvector column", () => {
    expect(vectorWidth("vector(768)")).toBe("768");
  });

  it("still reads it when the extension lives outside search_path", () => {
    expect(vectorWidth("superadmin.vector(1536)")).toBe("1536");
  });

  it("returns null for anything that is not a vector", () => {
    expect(vectorWidth("jsonb")).toBeNull();
    expect(vectorWidth("character varying(50)")).toBeNull();
    expect(vectorWidth(undefined)).toBeNull();
  });
});

describe("missingParents", () => {
  it("names every parent that has not been verified yet", () => {
    const spec = { parents: { course_id: "extraction_courses", campus_id: "extraction_campuses" } };
    expect(missingParents(spec, new Set(["extraction_courses"]))).toEqual(["extraction_campuses"]);
    expect(missingParents(spec, new Set(["extraction_courses", "extraction_campuses"]))).toEqual([]);
  });

  it("treats a table with no parents as always safe", () => {
    expect(missingParents({}, new Set())).toEqual([]);
  });
});
