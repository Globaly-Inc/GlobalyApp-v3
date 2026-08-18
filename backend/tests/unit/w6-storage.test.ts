// W6 (storage rehost) — the half that can be checked without a database, and
// without V1.
//
// W6's object copy cannot run until the `gmig_` token exists (§7 decision 7:
// minted at rehearsal #1), so every decision it makes has to be checkable
// offline or it is not checkable at all until cutover day. These are the ones
// that would still load cleanly while being wrong:
//
//   a key derived twice differently   the copy uploads to a path nothing points at
//   a URL rewritten to a dropped bucket  a path that will never have an object
//   a query string kept in the key    one object, two keys, and no idempotence
//   an unnormalised Gate 2 mapping    a green gate that flips red on wave order
//   a jsonb rewrite that reshapes     a gallery quietly turned into a string
//
// The SQL side of the rewrite is exercised against a real Postgres in
// tests/integration/w6-storage-rewrite.test.ts — a regex that is wrong in
// Postgres' ARE but right in JavaScript is exactly the bug this file cannot see.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { objectsSelfCheck, registryEntry, listEndpoint, signEndpoint, parseObjectFlags, bytesUnder } from "../../scripts/migration/w6-objects.js";
import {
  DROPPED_BUCKETS,
  MIGRATED_BUCKETS,
  isNormalisedSql,
  objectBasename,
  parseObjectUrl,
  pathOwnerUuid,
  storageMapSelfCheck,
  toStorageKey,
  v1StoragePathSql,
} from "../../scripts/migration/w6-storage-map.js";
import { sweepSelfCheck, valueExpr, type ColumnRef } from "../../scripts/migration/w6-storage-sweep.js";
import {
  STORAGE_SOURCE,
  TENANT_SCHEMA_KEY,
  mappedStorageColumns,
  mappingDriftProblems,
  rewriteStatement,
  storageSelfCheck,
  type InventoryEntry,
} from "../../scripts/migration/w6-storage.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(readFileSync(path.join(HERE, "../../scripts/migration/mapping.json"), "utf8")) as {
  meta: { reasonCodes: Record<string, string> };
  tables: Record<string, { disposition: string; storageRehost?: string[]; storageRehostDeferred?: string[]; storageRehostNote?: string }>;
};

const V1 = "https://irhwtbyvrbaublgxvpfp.supabase.co/storage/v1/object";

/** `regexp_replace(t.logo_url, '…')` -> `t.logo_url`: the expression it wraps. */
const unwrap = (sql: string): string => sql.slice("regexp_replace(".length, sql.indexOf(", '"));

const inventoryEntry = (over: Partial<InventoryEntry>): InventoryEntry => ({
  schema: "public",
  table: "platform_users",
  column: "photo_url",
  udt: "text",
  rows: 1,
  refs: 1,
  objects: 1,
  rehostable: 1,
  unmigratable: [],
  mapping: null,
  ...over,
});

describe("W6 self-checks", () => {
  it.each([
    ["w6-storage-map", storageMapSelfCheck],
    ["w6-storage-sweep", sweepSelfCheck],
    ["w6-objects", objectsSelfCheck],
    ["w6-storage", storageSelfCheck],
  ])("%s --self-check passes", (_name, check) => {
    expect(() => check()).not.toThrow();
  });
});

describe("key derivation is one function, whatever V1's URL looks like", () => {
  // Every shape that is actually in v1_staging today, plus the two access modes
  // V1 also hands out. One object must always be one key.
  it.each([
    [`${V1}/public/avatars/a821aff9-eedb-47f4-95d3-f30fa932505b/1775109935170.jpg`, "v1/avatars/a821aff9-eedb-47f4-95d3-f30fa932505b/1775109935170.jpg"],
    [`${V1}/public/avatars/covers/9b8b3bf9/biz-1ad10c82-1774515587270.png`, "v1/avatars/covers/9b8b3bf9/biz-1ad10c82-1774515587270.png"],
    [`${V1}/public/blog-images/ai-cover-1771427422749-mtzgl.png`, "v1/blog-images/ai-cover-1771427422749-mtzgl.png"],
    [`${V1}/sign/verification-docs/64701ef7/proof.png`, "v1/verification-docs/64701ef7/proof.png"],
    [`${V1}/authenticated/student-documents/64701ef7/passport.pdf`, "v1/student-documents/64701ef7/passport.pdf"],
    // The cache-buster that is really in the data. Keeping it would give this one
    // object two keys and end idempotence.
    [`${V1}/public/business-assets/test-logos/LSAT.png?v=3`, "v1/business-assets/test-logos/LSAT.png"],
  ])("%s", (url, key) => {
    expect(toStorageKey(url)).toBe(key);
    // Applying the rewriter to its own output must be a no-op — the single
    // property the whole wave's idempotence rests on.
    expect(toStorageKey(key)).toBeNull();
  });

  it("refuses a bucket W6 does not migrate rather than minting a dangling path", () => {
    for (const { bucket } of DROPPED_BUCKETS) {
      const url = `${V1}/public/${bucket}/some/object.png`;
      expect(toStorageKey(url)).toBeNull();
      // …but it is still recognisably a V1 URL, so the wave reports it.
      expect(parseObjectUrl(url)).toBeNull();
    }
  });

  it.each([
    ["https://images.pexels.com/photos/4103247/pexels-photo.jpeg?auto=compress", "an external image URL"],
    ["v1/avatars/x/y.jpg", "an already-rewritten key"],
    ["", "an empty string"],
  ])("leaves %s alone (%s)", (value) => {
    expect(toStorageKey(value)).toBeNull();
  });

  it("carries V2's 13-migrate / 3-drop reconciliation, with a reason for each drop", () => {
    expect(MIGRATED_BUCKETS).toHaveLength(13);
    expect(DROPPED_BUCKETS).toHaveLength(3);
    expect(MIGRATED_BUCKETS.length + DROPPED_BUCKETS.length).toBe(16);
    for (const d of DROPPED_BUCKETS) {
      expect(MIGRATED_BUCKETS).not.toContain(d.bucket);
      expect(d.reason.length).toBeGreaterThan(20);
    }
  });
});

describe("the rewrite is guarded, typed and ordered", () => {
  const shapes: [string, ColumnRef][] = [
    ["text", { schema: "public", table: "businesses", column: "logo_url", udt: "text" }],
    ["jsonb", { schema: "public", table: "businesses", column: "gallery_urls", udt: "jsonb" }],
    ["text[]", { schema: "public", table: "businesses", column: "gallery_images", udt: "_text" }],
  ];

  it.each(shapes)("%s: the UPDATE fires only where the value will change", (_udt, ref) => {
    const sql = rewriteStatement(ref);
    expect(sql).toMatch(/^UPDATE /);
    // Guarded on the REHOSTABLE pattern (closed bucket list), not on "contains
    // supabase" — otherwise a second run rewrites rows it cannot change and
    // idempotence stops being observable in the row counts.
    expect(sql).toContain(" WHERE ");
    expect(sql).toContain("avatars|blog-images");
  });

  it("keeps a jsonb column jsonb, and rewrites it shape-agnostically", () => {
    const sql = rewriteStatement(shapes[1][1]);
    expect(sql).toContain("::jsonb");
    // A whole-document text rewrite, so it works for `gallery_urls`' array of
    // objects and for whatever shape the next jsonb column turns out to be.
    expect(sql).toContain("::text");
    expect(sql).not.toContain("jsonb_array_elements");
  });

  it("keeps a text[] column text[] and preserves element order", () => {
    const sql = rewriteStatement(shapes[2][1]);
    expect(sql).toContain("::text[]");
    // array_agg without ORDER BY may reshuffle. A gallery is an ordered list.
    expect(sql).toContain("ORDER BY u.o");
  });

  it("searches an array by flattening it, not by casting it to text", () => {
    expect(valueExpr(shapes[2][1])).toBe(`array_to_string(s."gallery_images", ' ')`);
    expect(valueExpr(shapes[0][1])).toBe('s."logo_url"::text');
  });

  it("quotes identifiers, because V3's tenant schemas are uuid-named", () => {
    const sql = rewriteStatement({ schema: "3829ff2a-7ff9-0ffc", table: "business_services", column: "image_url", udt: "text" });
    expect(sql).toContain('"3829ff2a-7ff9-0ffc"."business_services"');
  });
});

describe("Gate 2 stays exact across the rewrite", () => {
  const index = mappedStorageColumns();

  it("indexes mapping targets by their PHYSICAL column, not their logical name", () => {
    // platform_users.photo_url is sourced from profiles.avatar_url — resolving by
    // the mapping's column name would miss it.
    expect(index.has("public.platform_users.photo_url")).toBe(true);
    expect(index.has("superadmin.blog_posts.cover_image_url")).toBe(true);
  });

  it("indexes tenant mappings under the schema placeholder", () => {
    // A tenant target is `"{{schema}}".<table>`, expanded per business at gate
    // time. Without this the guard is blind to exactly the tables W7 fills.
    const tenantKeys = [...index.keys()].filter((k) => k.startsWith(TENANT_SCHEMA_KEY));
    expect(tenantKeys.length).toBeGreaterThan(0);
  });

  it("every V3 column the ledger declares as rehosted has a normalised mapping", () => {
    const declared = Object.values(MANIFEST.tables).flatMap((t) => t.storageRehost ?? []);
    expect(declared.length).toBeGreaterThan(0);
    for (const col of declared) {
      const m = index.get(col);
      expect(m, `${col} is declared storageRehost but no Gate 2 mapping compares it`).toBeDefined();
      // Both sides, with the SAME expression: that is what makes the check
      // "these point at the same object" rather than "these strings are equal",
      // and what keeps it green before AND after the rewrite.
      expect(isNormalisedSql(m!.source), `${col}: mapping source is not normalised`).toBe(true);
      expect(isNormalisedSql(m!.target), `${col}: mapping target is not normalised`).toBe(true);
      // Normalised with THE shared expression, not a hand-rolled lookalike.
      expect(m!.source).toBe(v1StoragePathSql(unwrap(m!.source)));
      expect(m!.target).toBe(v1StoragePathSql(unwrap(m!.target)));
    }
  });

  // Any mapped column that is NOT declared as rehosted — chosen from the manifest
  // rather than named here, so this stays true as mappings come and go.
  const bareColumn = [...index].find(([col, m]) => !isNormalisedSql(m.source) && !col.startsWith(TENANT_SCHEMA_KEY));

  it("fires on a bare mapping expression", () => {
    // The failure it exists to catch: a rewritten column compared raw.
    expect(bareColumn, "the manifest has no un-normalised mapping left to test against").toBeDefined();
    const [col] = bareColumn!;
    const [schema, table, column] = col.split(".");
    const problems = mappingDriftProblems([inventoryEntry({ schema, table, column, rehostable: 1 })]);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join("\n")).toContain("without normalising it");
  });

  it("says nothing about a column with nothing to rehost", () => {
    const [col] = bareColumn!;
    const [schema, table, column] = col.split(".");
    expect(mappingDriftProblems([inventoryEntry({ schema, table, column, rehostable: 0 })])).toEqual([]);
  });
});

describe("the ledger records the rehost at both ends", () => {
  it("names the V3 columns W6 rewrites on the V1 table they came from", () => {
    // W2b started this with test_provider_logos. Every entry must survive, and
    // each must carry a note — a bare column list is a claim, not a record.
    const withRehost = Object.entries(MANIFEST.tables).filter(([, t]) => t.storageRehost);
    expect(withRehost.length).toBeGreaterThanOrEqual(5);
    for (const [table, entry] of withRehost) {
      expect(entry.storageRehostNote, `${table} declares storageRehost with no note`).toBeTruthy();
      for (const col of entry.storageRehost!) {
        expect(col, `${table}: ${col} must be schema-qualified`).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
      }
    }
    expect(MANIFEST.tables.test_provider_logos.storageRehost).toContain("public.test_provider_logos.logo_url");
  });

  it("records the URL-bearing columns whose V3 target lands in a later wave", () => {
    // These hold supabase URLs in v1_staging today but have no V3 row to rewrite
    // yet. Written down so "the rehost is complete" is checkable rather than
    // assumed — the sweep will pick them up once their wave lands.
    const deferred = Object.entries(MANIFEST.tables).filter(([, t]) => t.storageRehostDeferred);
    expect(deferred.length).toBeGreaterThanOrEqual(3);
    for (const [table, entry] of deferred) {
      expect(entry.storageRehostNote, `${table} defers a rehost with no note`).toBeTruthy();
      expect(entry.storageRehost, `${table} cannot both defer and declare the same rehost`).toBeUndefined();
    }
  });

  it("reports unrehostable URLs with a code from the closed enum", () => {
    // Gate 2 check 6: an unknown reason is a red gate.
    expect(Object.keys(MANIFEST.meta.reasonCodes)).toContain("unresolved_parent");
    expect(Object.keys(MANIFEST.meta.reasonCodes)).toContain("unresolved_user");
  });

  it("keys its report rows to V1 storage, not to a V1 table", () => {
    // Otherwise these rows would land in some mapping's count reconciliation and
    // excuse a missing row they have nothing to do with.
    expect(STORAGE_SOURCE).toBe("v1_storage");
    expect(Object.keys(MANIFEST.tables)).not.toContain(STORAGE_SOURCE);
  });
});

describe("the object copy is complete, unrun, and honest about it", () => {
  it("builds V2's endpoints with everything encoded", () => {
    const base = "https://ref.supabase.co/functions/v1";
    expect(listEndpoint(base, "avatars", "covers/x", 1000, 0)).toBe(
      `${base}/migration-export/storage/list?bucket=avatars&prefix=covers%2Fx&limit=1000&offset=0`,
    );
    // A path with a `+` or a space must not become a different path.
    expect(signEndpoint(base, "business-assets", "test logos/a+b.png")).toContain("test%20logos%2Fa%2Bb.png");
  });

  it("refuses --buckets for a bucket it does not migrate", () => {
    expect(() => parseObjectFlags(["--buckets=database_export_03_07_26"])).toThrow(/does not migrate/);
    expect(parseObjectFlags(["--buckets=avatars"]).buckets).toEqual(["avatars"]);
  });

  it("derives the registry row from the object, and never invents an owner", () => {
    const object = { bucket: "avatars", path: "a821aff9-eedb-47f4-95d3-f30fa932505b/1775109935170.jpg" };
    // The uuid resolved to a platform_users row, so it is used.
    expect(registryEntry(object, "platform_user")).toEqual({
      entity_type: "platform_user",
      entity_id: "a821aff9-eedb-47f4-95d3-f30fa932505b",
      category: "avatars",
      original_name: "1775109935170.jpg",
    });
    // It did not resolve, so the entity is the bucket — truthful provenance
    // rather than an owner nobody checked.
    expect(registryEntry(object, null).entity_type).toBe("v1_bucket");
    expect(registryEntry({ bucket: "blog-images", path: "ai-cover.png" }, null).entity_id).toBe("blog-images");
  });

  it("finds V1's uploader in the object path, and no uploader when there is none", () => {
    expect(pathOwnerUuid("a821aff9-eedb-47f4-95d3-f30fa932505b/x.jpg")).toBe("a821aff9-eedb-47f4-95d3-f30fa932505b");
    expect(pathOwnerUuid("covers/c788f3ff-58fa-40d1-9a8d-9738adf1b1fc/biz-432d9267-1.png")).toBe(
      "c788f3ff-58fa-40d1-9a8d-9738adf1b1fc",
    );
    expect(pathOwnerUuid("test-logos/TOEFL.svg")).toBeNull();
    expect(objectBasename("test-logos/LSAT.png?v=3")).toBe("LSAT.png");
  });

  it("counts bytes per bucket by prefix, not by name prefix", () => {
    const stat = new Map([
      ["v1/avatars/a.jpg", 10],
      ["v1/avatars-old/b.jpg", 40],
      ["v1/blog-images/c.png", 30],
    ]);
    expect(bytesUnder(stat, "avatars")).toBe(10);
    expect(bytesUnder(stat, "chat-attachments")).toBe(0);
  });
});
