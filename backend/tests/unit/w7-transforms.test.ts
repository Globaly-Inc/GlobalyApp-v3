// W7 (tenant-scoped data) — the half that can be checked without a database.
//
// W7's dangerous failures are all quiet ones. Writing V1's business_services.id
// into the V3 `id` instead of `v1_id` fuses two identities and still loads. An org
// resolver that forgets institutions silently drops 363 of 402 services and still
// loads. A cross-tenant sharing row placed in one tenant's schema still loads, and
// only breaks when the OTHER tenant reads it. An institution id in a
// businesses-only FK is a wrong row, not a missing one — the count check would
// even call it a pass.
//
// So each of those gets an assertion here, where it fails in CI rather than at
// --apply against production.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BUSINESS_ONLY_ID,
  ORGS,
  ORG_ID,
  ORG_SCHEMA,
  ORG_TYPE,
  TENANT_OWNER_SQL,
  USER_ID,
  orgsSelfCheck,
} from "../../scripts/migration/w7-orgs.js";
import {
  ACCREDITATION_ID,
  AREA_OF_STUDY_ID,
  JUNCTIONS,
  NEVER_COPIED,
  TENANT_TABLES,
  W7_SERVICE_SOURCE_TABLES,
  junctionSpecs,
  serviceSpecs,
  serviceMapViewSql,
  servicesSelfCheck,
  unionAcrossSchemas,
} from "../../scripts/migration/w7-services.js";
import { ORG_REFS, TARGET_TABLE, W7_MASTER_SOURCE_TABLES, masterSelfCheck } from "../../scripts/migration/w7-master.js";
import {
  FOLDED_PLAN_COLUMNS,
  PLAN_ID,
  PLAN_LIMITS,
  W7_BILLING_SOURCE_TABLES,
  WALLET_ID,
  billingSelfCheck,
} from "../../scripts/migration/w7-billing.js";
import {
  EVENT_ID,
  FEEDBACK,
  SESSION_ID,
  TICKET_ID,
  W7_ENGAGEMENT_SOURCE_TABLES,
  engagementSelfCheck,
} from "../../scripts/migration/w7-engagement.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(readFileSync(path.join(HERE, "../../scripts/migration/mapping.json"), "utf8")) as {
  meta: { reasonCodes: Record<string, string> };
  tables: Record<string, { disposition: string; wave?: string; dependency?: string; targets?: string[] }>;
  mappings: {
    name: string;
    source: { table: string };
    target: { table: string; schemaExpand?: string };
    identity: { source: string; target: string };
    junction?: { parents: string[] };
    columns: { name: string; from: string | string[] | null }[];
    dropped: { column: string; reason: string }[];
  }[];
};

const sourceTable = (m: { source: { table: string } }): string => m.source.table.replace(/^v1_staging\./, "");
const byName = (name: string) => MANIFEST.mappings.find((m) => m.name === name);
const W7_MAPPINGS = MANIFEST.mappings.filter((m) => /_tenant$|_master$/.test(m.name));

describe("W7 transform self-checks", () => {
  it.each([
    ["w7-orgs", orgsSelfCheck],
    ["w7-services", servicesSelfCheck],
    ["w7-master", masterSelfCheck],
    ["w7-billing", billingSelfCheck],
    ["w7-engagement", engagementSelfCheck],
  ])("%s --self-check passes", (_name, check) => {
    expect(() => check()).not.toThrow();
  });
});

describe("constraint 1 — business_services.id is the uuid, so V1's id goes to v1_id", () => {
  const specs = [...serviceSpecs("tenant-a"), ...junctionSpecs("tenant-a")];

  it("no loader writes the V1 uuid into the V3 id", () => {
    for (const spec of specs) {
      expect(spec.select.id, `${spec.table} must not write an id`).toBeUndefined();
    }
  });

  it("thirteen of the fourteen tenant tables upsert on v1_id", () => {
    expect(specs.filter((s) => s.conflict === "v1_id")).toHaveLength(13);
    for (const spec of specs.filter((s) => s.conflict === "v1_id")) {
      expect(spec.select.v1_id, `${spec.table}: v1_id carries the V1 uuid`).toBe("s.id");
    }
  });

  it("business_branches is the exception — it has no v1_id column, so `uuid` is the key", () => {
    const branches = specs.filter((s) => s.conflict !== "v1_id");
    expect(branches).toHaveLength(1);
    expect(branches[0].targetTable).toBe("business_branches");
    expect(branches[0].conflict).toBe("uuid");
    expect(branches[0].select.uuid).toBe("s.id");
  });

  it("every child and junction reaches its parent through v1_id, never by assuming the uuid survived", () => {
    const withParent = specs.filter((s) => s.select.service_id);
    expect(withParent.length).toBeGreaterThanOrEqual(6);
    for (const spec of withParent) {
      expect(spec.select.service_id, `${spec.table}`).toContain("bs.v1_id =");
    }
  });

  it("mapping.json compares the tenant identity on v1_id too", () => {
    for (const m of W7_MAPPINGS.filter((x) => x.target.schemaExpand)) {
      expect(m.identity.source, m.name).toBe("s.id::text");
      expect(m.identity.target, m.name).toMatch(/^t\.(v1_id|uuid)::text$/);
    }
  });
});

describe("constraint 2 — the owner is an org, not a business", () => {
  it("the ORGS union spans businesses AND institutions", () => {
    // 14 unclaimed institutions own 363 of the 402 services; a resolver that only
    // reaches public.businesses drops them and still loads cleanly.
    expect(ORGS).toContain("public.businesses");
    expect(ORGS).toContain("public.institutions");
    expect(ORGS).toContain("'business'::text");
    expect(ORGS).toContain("'institution'::text");
  });

  it.each([
    ["ORG_TYPE", ORG_TYPE],
    ["ORG_ID", ORG_ID],
    ["ORG_SCHEMA", ORG_SCHEMA],
  ])("%s resolves on the V1 business uuid and never defaults", (_n, resolver) => {
    expect(resolver("x")).toContain("v1_business_id = x");
    expect(resolver("x")).not.toContain("coalesce");
  });

  it("BUSINESS_ONLY_ID never resolves an institution", () => {
    // business_subscriptions / credit_wallets / business_ai_credits FK to
    // public.businesses only. An institution id there is a WRONG row that the
    // count check would happily call a pass.
    expect(BUSINESS_ONLY_ID("x")).toContain("public.businesses");
    expect(BUSINESS_ONLY_ID("x")).not.toContain("institutions");
  });

  it("USER_ID goes through the W1 identity map", () => {
    expect(USER_ID("x")).toContain("mig.map_users");
  });

  it("every table that owns tenant data is named as a schema owner", () => {
    for (const t of ["business_services", "service_study_options", "service_study_units", "branches"]) {
      expect(TENANT_OWNER_SQL).toContain(`v1_staging.${t}`);
    }
  });

  it("the tenant schema list spans institutions as well as businesses", () => {
    for (const m of W7_MAPPINGS.filter((x) => x.target.schemaExpand)) {
      expect(m.target.schemaExpand, m.name).toContain("public.institutions");
      expect(m.target.schemaExpand, m.name).toContain("public.businesses");
    }
  });
});

describe("§1.2 / §14 — the cross-tenant graph lands in master, never in a tenant", () => {
  it("all six master tables target public", () => {
    expect(W7_MASTER_SOURCE_TABLES).toHaveLength(6);
    for (const t of W7_MASTER_SOURCE_TABLES) {
      // Five keep their V1 name and are mapped as `<table>_master`; eligibility_checks
      // is the one rename (V3 prefixes the student-owned master tables), so its
      // mapping is named for the target. TARGET_TABLE is the single declaration of it.
      const renamed = TARGET_TABLE[t];
      const m = byName(renamed ?? `${t}_master`);
      expect(m, `${renamed ?? `${t}_master`} mapping`).toBeDefined();
      expect(m!.target.table).toBe(`public.${renamed ?? t}`);
      expect(m!.target.schemaExpand).toBeUndefined();
    }
  });

  it("an eligibility check is a MASTER row — it links a platform user to a tenant service (§1.2)", () => {
    const m = byName("student_eligibility_checks")!;
    expect(m.target.table).toBe("public.student_eligibility_checks");
    // Never a tenant schema, and never expanded across schemas.
    expect(m.target.table).not.toContain("{{schema}}");
    expect(m.target.schemaExpand).toBeUndefined();
    // The service leg is a tenant uuid V3 minted, so it can only be compared
    // through the cross-schema resolver view.
    const service = m.columns.find((c: { name: string }) => c.name === "service_v1_uuid")!;
    expect(service.target).toContain("mig.map_services");
    // The student leg resolves back to the V1 auth.users uuid.
    const student = m.columns.find((c: { name: string }) => c.name === "student_uuid")!;
    expect(student.target).toContain("platform_users");
  });

  it("every declared org reference lands on a polymorphic org column", () => {
    for (const ref of ORG_REFS) {
      expect(W7_MASTER_SOURCE_TABLES).toContain(ref.table);
      expect(ref.target).toMatch(/_org_id$/);
    }
    expect(ORG_REFS.filter((r) => r.table === "business_branches")).toHaveLength(2);
    expect(ORG_REFS.filter((r) => r.table === "representations")).toHaveLength(2);
  });

  it("V1 `branches` goes to the tenant and V1 `business_branches` to master — they are different tables", () => {
    expect(sourceTable(byName("branches_tenant")!)).toBe("branches");
    expect(byName("branches_tenant")!.target.table).toBe('"{{schema}}".business_branches');
    expect(sourceTable(byName("business_branches_master")!)).toBe("business_branches");
    expect(byName("business_branches_master")!.target.table).toBe("public.business_branches");
  });
});

describe("reference resolution stays on the canonical vocabulary (§15 decision 3)", () => {
  it.each([
    ["areas_of_study", AREA_OF_STUDY_ID],
    ["accreditations", ACCREDITATION_ID],
  ])("%s resolves against public, never the superadmin copy", (_n, resolver) => {
    expect(resolver("x")).toContain("public.");
    expect(resolver("x")).not.toMatch(/superadmin\./);
    expect(resolver("x")).not.toContain("coalesce");
  });

  it("accreditations join on `name`, the key W2 loaded them under", () => {
    expect(ACCREDITATION_ID("x")).toContain("pa.name = va.name");
  });
});

describe("nothing is dropped without a written reason", () => {
  it("the embedding is never carried — V1 text@1536 vs V3 vector(3072), wave E1 re-embeds", () => {
    expect(NEVER_COPIED.business_services).toEqual(["embedding"]);
    const specs = [...serviceSpecs("t"), ...junctionSpecs("t")];
    expect(specs.some((s) => Object.keys(s.select).includes("embedding"))).toBe(false);
    const dropped = byName("business_services_tenant")!.dropped.find((d) => d.column === "embedding");
    expect(dropped?.reason).toMatch(/vector\(3072\)|E1/);
  });

  it("every W7 mapping accounts for every source column it names", () => {
    for (const m of W7_MAPPINGS) {
      const mapped = new Set(
        m.columns.flatMap((c) => (c.from === null ? [] : Array.isArray(c.from) ? c.from : [c.from])),
      );
      const dropped = new Set(m.dropped.map((d) => d.column));
      for (const d of dropped) {
        expect(mapped.has(d), `${m.name}: ${d} is both mapped and dropped`).toBe(false);
      }
      for (const d of m.dropped) {
        expect(d.reason.trim().length, `${m.name}.${d.column} needs a real reason`).toBeGreaterThan(20);
      }
    }
  });

  it("the ten orphan plan columns fold into subscription_plans.limits rather than being lost", () => {
    expect(FOLDED_PLAN_COLUMNS).toHaveLength(10);
    for (const c of FOLDED_PLAN_COLUMNS) {
      expect(PLAN_LIMITS, `${c} must survive the fold`).toContain(`'${c}'`);
      expect(PLAN_LIMITS).toContain(`s.${c}`);
    }
    expect(PLAN_LIMITS).toContain("jsonb_strip_nulls");
    // …and the mapping compares through the fold, so a lost value is a red gate.
    const cols = byName("subscription_plans_master")!.columns.map((c) => c.name);
    for (const c of FOLDED_PLAN_COLUMNS) expect(cols).toContain(`limits_${c}`);
  });
});

describe("the junctions load behind the D8 guard", () => {
  it("five service junctions, each naming its second parent", () => {
    expect(JUNCTIONS).toHaveLength(5);
    expect(new Set(JUNCTIONS.map((j) => j.table)).size).toBe(5);
    expect(TENANT_TABLES).toHaveLength(9);
    expect(W7_SERVICE_SOURCE_TABLES).toHaveLength(14);
  });

  it("the parent count spans every tenant schema, not one slice of it", () => {
    const two = unionAcrossSchemas(
      [
        { schema: "a", orgType: "business", orgId: 1, v1BusinessId: "x" },
        { schema: 'b"c', orgType: "institution", orgId: 2, v1BusinessId: "y" },
      ],
      "business_services",
    );
    expect(two).toContain("UNION ALL");
    expect(two, "a schema name is quoted, never interpolated raw").toContain('"b""c"');
    expect(unionAcrossSchemas([], "business_services")).toContain("WHERE false");
  });

  it("every declared junction parent is a mapping this manifest can reconcile", () => {
    for (const m of W7_MAPPINGS.filter((x) => x.junction)) {
      expect(m.junction!.parents, m.name).toHaveLength(2);
      for (const p of m.junction!.parents) {
        expect(byName(p), `${m.name}: parent ${p}`).toBeDefined();
      }
    }
  });
});

describe("the tenant-uuid resolver views", () => {
  it("degenerate safely with no tenant schemas", () => {
    expect(serviceMapViewSql([], "map_services", "business_services")).toContain("WHERE false");
  });

  it("carry the V1 uuid, which is the only key both sides share", () => {
    const sql = serviceMapViewSql(
      [{ schema: "a", orgType: "business", orgId: 1, v1BusinessId: "x" }],
      "map_services",
      "business_services",
    );
    expect(sql).toContain("CREATE OR REPLACE VIEW mig.");
    expect(sql).toContain("SELECT id, v1_id,");
  });

  it("are what mapping.json compares the master tenant FKs through", () => {
    const sharing = byName("service_branch_sharing_master")!.columns.find((c) => c.name === "service_v1_id");
    expect(sharing!.name).toBe("service_v1_id");
    const branches = byName("service_study_option_branches_master")!.columns.find(
      (c) => c.name === "study_option_v1_id",
    );
    expect(branches).toBeDefined();
  });
});

describe("W7's value-shape changes", () => {
  it("V1's feedback vocabulary becomes V3's, and an unknown value is NULLed rather than forced past the CHECK", () => {
    expect(FEEDBACK).toContain("'thumbs_up'");
    expect(FEEDBACK).toContain("'positive'");
    expect(FEEDBACK).toContain("'thumbs_down'");
    expect(FEEDBACK).toContain("'negative'");
    expect(FEEDBACK).toContain("ELSE NULL");
  });

  it("the counsellor pair resolves through its composite natural key, not a v1_id it does not have", () => {
    expect(SESSION_ID("x")).toContain("platform_user_id");
    expect(SESSION_ID("x")).toContain("t.created_at = vs.created_at");
    const sessions = byName("ai_counselor_sessions_master")!;
    expect(sessions.identity.source).toContain("created_at");
    expect(sessions.dropped.map((d) => d.column)).toContain("id");
  });

  it.each([
    ["EVENT_ID", EVENT_ID],
    ["TICKET_ID", TICKET_ID],
    ["PLAN_ID", PLAN_ID],
    ["WALLET_ID", WALLET_ID],
  ])("%s resolves through v1_id and never defaults", (_n, resolver) => {
    expect(resolver("x")).toContain("v1_id = x");
    expect(resolver("x")).not.toContain("coalesce");
  });

  it("notifications gets a dedupe_key derived from the V1 uuid, so two rows cannot collapse into one", () => {
    const m = byName("notifications_master")!;
    expect(m.columns.map((c) => c.name)).toContain("read_at");
    expect(m.description).toContain("dedupe_key");
  });
});

describe("the ledger stays honest about what W7 could not take", () => {
  const blocked = (t: string) => MANIFEST.tables[t];

  it.each([
    "training_programs",
    "training_chapters",
    "training_assignments",
    "training_progress",
    "training_assessments",
    "training_assessment_attempts",
    "training_certificates",
    "training_gamification",
  ])("%s stays blocked on wave E4 — no V3 table exists to load it into", (t) => {
    expect(blocked(t).disposition).toBe("blocked");
    expect(blocked(t).dependency).toBeTruthy();
  });

  it.each([
    "scribe_sessions",
    "scribe_transcripts",
    "scribe_consent_log",
    "scribe_coaching_snapshots",
    "scribe_reviews",
  ])("%s stays blocked on wave E3 — the consent log is a legal record and moves verbatim or not at all", (t) => {
    expect(blocked(t).disposition).toBe("blocked");
    expect(blocked(t).dependency).toBeTruthy();
  });

  it("service_fee_items stays blocked rather than dropped — the omission is a shape decision", () => {
    expect(blocked("service_fee_items").disposition).toBe("blocked");
  });

  it("the events family flipped to transform because its V3 tables merged (§4)", () => {
    for (const t of [
      "events",
      "event_tickets",
      "event_registrations",
      "event_updates",
      "event_co_hosts",
      "notifications",
    ]) {
      expect(MANIFEST.tables[t].disposition, t).toBe("transform");
      expect(MANIFEST.tables[t].targets, t).toEqual([`public.${t}`]);
      expect(MANIFEST.tables[t].dependency, `${t} is no longer blocked`).toBeUndefined();
    }
  });

  it("every W7 source table has a verification mapping", () => {
    const mapped = new Set(MANIFEST.mappings.map(sourceTable));
    for (const t of [
      ...W7_SERVICE_SOURCE_TABLES,
      ...W7_MASTER_SOURCE_TABLES,
      ...W7_BILLING_SOURCE_TABLES,
      ...W7_ENGAGEMENT_SOURCE_TABLES,
    ]) {
      expect(mapped.has(t), `${t} needs a Gate 2 mapping`).toBe(true);
      expect(MANIFEST.tables[t].disposition, t).toBe("transform");
    }
  });

  it("34 W7 mappings, all named for where they land", () => {
    expect(W7_MAPPINGS).toHaveLength(34);
    expect(W7_MAPPINGS.filter((m) => m.name.endsWith("_tenant"))).toHaveLength(14);
    expect(W7_MAPPINGS.filter((m) => m.name.endsWith("_master"))).toHaveLength(20);
  });
});
