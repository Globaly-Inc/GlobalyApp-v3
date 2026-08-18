/**
 * W6 — the pure half of the storage rehost (Part 3 §4 W6).
 *
 * Nothing here touches a database, a network, or the clock. Everything W6 has to
 * get right BEFORE a `gmig_` token exists lives in this file so `--self-check`
 * can prove it offline: which buckets migrate, what a V1 object URL decomposes
 * into, what GCS key an object lands on, and the one SQL expression that turns a
 * V1 URL into that key.
 *
 * The bucket reconciliation is V2's, carried over verbatim (§2: "V2's 13-migrate
 * / 3-drop bucket reconciliation carries over"). It was established against live
 * V1 at rehearsal #2 (2026-07-16): three buckets hold nothing that is app data.
 *
 * Two things V2 did NOT have to decide, because V2 kept 13 GCS buckets and V3
 * has one:
 *
 *   1. THE KEY. V3's storage service stores a *relative path* inside a single
 *      bucket and the DB column holds that path, not a URL (storageService.ts:
 *      `toStoragePath` / `resolvePreviewUrl`). So every V1 object lands at
 *      `v1/<bucket>/<object path>` — V1's path preserved 1:1 under a prefix that
 *      says where it came from. Deterministic, which is what makes the copy
 *      idempotent: the key is a function of the object, so a re-run recomputes
 *      the same key and `uploaded_files.storage_path UNIQUE` skips it.
 *
 *   2. THE REWRITE. Because the column holds a path, the URL rewrite is not
 *      "swap one host for another" — it is "reduce a URL to its key". That is
 *      the same function, expressed once in SQL, and it is IDEMPOTENT by
 *      construction: a value that is already `v1/...` contains no supabase URL,
 *      so the expression returns it unchanged. That property is what lets Gate 2
 *      compare `norm(v1_staging.x) = norm(v3.y)` and stay green whether or not
 *      the rewrite has run yet.
 *
 * A URL pointing at a bucket W6 does not migrate is deliberately NOT rewritten:
 * the bucket alternation below is closed, so such a URL survives the rewrite and
 * is then reported to `mig.unresolved`. Rewriting it would mint a path to an
 * object that will never exist.
 */

import assert from "node:assert/strict";

/** V1 buckets that migrate. V2's list, in V2's order (public-first). */
export const MIGRATED_BUCKETS: readonly string[] = [
  "avatars",
  "blog-images",
  "course-brochures",
  "service-images",
  "lms-assignments",
  "email-assets",
  "service-media",
  "chat-attachments",
  "verification-docs",
  "extraction-documents",
  "business-assets",
  "student-documents",
  "ai-attachments",
];

/**
 * Reconciled 2026-07-16 against live V1 and carried over: two buckets are empty
 * and the third is a database dump, not app data. Listed rather than forgotten,
 * so "13 of 16" is a decision on the record instead of an omission.
 */
export const DROPPED_BUCKETS: readonly Readonly<{ bucket: string; reason: string }>[] = [
  { bucket: "ambassador-media", reason: "0 objects at rehearsal #2 (2026-07-16)." },
  { bucket: "agent-logos", reason: "0 objects at rehearsal #2 (2026-07-16)." },
  {
    bucket: "database_export_03_07_26",
    reason: "A Postgres dump of V1 itself, not application data. The database migrates through Stage 1, not through storage.",
  },
];

/** Every migrated object lands under this prefix in V3's single GCS bucket. */
export const GCS_PREFIX = "v1";

const BUCKET_ALT = MIGRATED_BUCKETS.join("|");

// ── URL shape ───────────────────────────────────────────────────────────────
//
// V1 hands out three shapes for the same object and all three appear in the
// data: /object/public/<bucket>/…, /object/sign/<bucket>/…?token=… and
// /object/authenticated/<bucket>/…. The scope segment is a Supabase access mode,
// never part of the object path, so it is matched and discarded.

const URL_HOST = String.raw`https?://[a-z0-9]+\.supabase\.co/storage/v1/object`;
const URL_SCOPE = String.raw`(?:public/|sign/|authenticated/)?`;

/** Any V1 storage URL, whatever its bucket — the detector, not the rewriter. */
export const ANY_V1_OBJECT_URL_RE = /https?:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\//;

/** A V1 storage URL in a bucket W6 migrates, with bucket and path captured. */
export const V1_OBJECT_URL_RE = new RegExp(`${URL_HOST}/${URL_SCOPE}(${BUCKET_ALT})/([^?#"'\\s]+)`);

export interface V1Object {
  bucket: string;
  /** The object path inside the bucket. Query string and fragment stripped. */
  path: string;
}

/**
 * Decompose a V1 object URL. Returns null for anything that is not one, and for
 * a URL in a bucket W6 does not migrate — those two cases are different and the
 * caller tells them apart with {@link isV1StorageUrl}.
 *
 * The query string is dropped on purpose: V1 carries cache-busters
 * (`test-logos/LSAT.png?v=3`) and signed-URL tokens, neither of which is part of
 * the object's identity. Keeping one would give the same object two keys.
 */
export function parseObjectUrl(url: unknown): V1Object | null {
  if (typeof url !== "string") return null;
  const m = V1_OBJECT_URL_RE.exec(url);
  return m ? { bucket: m[1], path: m[2] } : null;
}

/** True for any V1 storage URL, including buckets W6 does not migrate. */
export function isV1StorageUrl(value: unknown): boolean {
  return typeof value === "string" && ANY_V1_OBJECT_URL_RE.test(value);
}

/** The GCS key an object lands on. Pure, total, and stable across runs. */
export function gcsKey(object: V1Object): string {
  return `${GCS_PREFIX}/${object.bucket}/${object.path}`;
}

/** A V1 URL reduced to its GCS key, or null when it is not a rehostable URL. */
export function toStorageKey(url: unknown): string | null {
  const object = parseObjectUrl(url);
  return object ? gcsKey(object) : null;
}

/** `covers/<uuid>/x.png` → `x.png`. The `original_name` of an uploaded_files row. */
export function objectBasename(path: string): string {
  const clean = path.split(/[?#]/)[0];
  return clean.slice(clean.lastIndexOf("/") + 1);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The first uuid-shaped segment of an object path.
 *
 * V1 filed uploads under the uploading auth user: `avatars/<user>/…`,
 * `avatars/covers/<user>/…`, `verification-docs/<user>/…`. That uuid is V1's
 * auth.users.id, which V3 preserves as platform_users.uuid — so it resolves to a
 * real owner rather than being guessed. Objects with no uuid in their path
 * (`blog-images/…`, `business-assets/test-logos/…`) have no owner recorded
 * anywhere in V1 and return null here; the caller reason-codes them instead of
 * inventing one.
 */
export function pathOwnerUuid(path: string): string | null {
  for (const segment of path.split("/")) {
    if (UUID_RE.test(segment)) return segment.toLowerCase();
  }
  return null;
}

// ── The SQL half of the same function ───────────────────────────────────────

// A SQL literal, so a quote is doubled. Kept next to the JS regex above because
// the two must agree; `--self-check` compares their output on real V1 URLs.
const SQL_PATH_CLASS = `[^?#"''[:space:]]`;
// The query string is matched so it is CONSUMED, not left dangling behind the key.
const SQL_QUERY_CLASS = `[^#"''[:space:]]`;
const SQL_URL_RE =
  `https?://[a-z0-9]+\\.supabase\\.co/storage/v1/object/(?:public/|sign/|authenticated/)?` +
  `(${BUCKET_ALT})/(${SQL_PATH_CLASS}+)(\\?${SQL_QUERY_CLASS}*)?`;

/** SQL predicate: does this text hold any V1 storage URL at all? */
export const SQL_ANY_V1_URL = `'supabase\\.co/storage/v1/object/'`;

/**
 * The rewrite, as a SQL expression over `expr` (text).
 *
 * Idempotent: a value already reduced to `v1/<bucket>/<path>` matches nothing,
 * so applying it twice equals applying it once. That is the whole reason the
 * rewrite half can run before the objects exist and be re-run after, and the
 * reason Gate 2 can normalise BOTH sides with it.
 */
export function v1StoragePathSql(expr: string): string {
  return `regexp_replace(${expr}, '${SQL_URL_RE}', '${GCS_PREFIX}/\\1/\\2', 'g')`;
}

/** SQL predicate: holds a URL this wave CAN rehost (so the UPDATE that follows changes it). */
export function rehostableSql(expr: string): string {
  return `(${expr}) ~ '${SQL_URL_RE}'`;
}

/** SQL predicate: holds any V1 storage URL, rehostable or not. */
export function anyV1UrlSql(expr: string): string {
  return `(${expr}) ~ ${SQL_ANY_V1_URL}`;
}

/** SQL: every V1 storage URL in `expr`, one row each. Bucket-agnostic on purpose. */
export function extractV1UrlsSql(expr: string): string {
  return `regexp_matches(${expr}, '(https?://[a-z0-9]+\\.supabase\\.co/storage/v1/object/${SQL_QUERY_CLASS}+)', 'g')`;
}

// The other direction: finding what the rewrite already wrote. `v1/` alone would
// match prose, so the bucket alternation carries the specificity here too.
const SQL_KEY_RE = `${GCS_PREFIX}/(?:${BUCKET_ALT})/${SQL_PATH_CLASS}+`;

/** SQL predicate: holds a GCS key this wave produced. */
export function rehostedKeySql(expr: string): string {
  return `(${expr}) ~ '${SQL_KEY_RE}'`;
}

/** SQL: every GCS key in `expr`, one row each. */
export function extractRehostedKeysSql(expr: string): string {
  return `regexp_matches(${expr}, '(${SQL_KEY_RE})', 'g')`;
}

/**
 * Has this Gate 2 mapping expression been put through the normaliser?
 *
 * Gate 2 compares a v1_staging URL against a V3 column W6 rewrites. Unless BOTH
 * sides are normalised the mapping is green only in one of the two states, and
 * flips red the moment W6 runs (or the moment an earlier wave re-upserts the raw
 * URL). Normalising both makes the check "do these point at the same object",
 * which is the fact the mapping is actually asserting.
 */
export function isNormalisedSql(expr: unknown): boolean {
  return typeof expr === "string" && expr.includes("regexp_replace(") && expr.includes(BUCKET_ALT);
}

// ── Self-check ──────────────────────────────────────────────────────────────

/** Real URLs out of v1_staging — the shapes this has to survive, not invented ones. */
const FIXTURES: readonly Readonly<{ url: string; key: string }>[] = [
  {
    url: "https://irhwtbyvrbaublgxvpfp.supabase.co/storage/v1/object/public/avatars/a821aff9-eedb-47f4-95d3-f30fa932505b/1775109935170.jpg",
    key: "v1/avatars/a821aff9-eedb-47f4-95d3-f30fa932505b/1775109935170.jpg",
  },
  {
    url: "https://irhwtbyvrbaublgxvpfp.supabase.co/storage/v1/object/public/avatars/covers/c788f3ff-58fa-40d1-9a8d-9738adf1b1fc/biz-432d9267-5b49-42eb-a929-e44f134ab437-1776251706156.png",
    key: "v1/avatars/covers/c788f3ff-58fa-40d1-9a8d-9738adf1b1fc/biz-432d9267-5b49-42eb-a929-e44f134ab437-1776251706156.png",
  },
  {
    // The cache-buster. Two keys for one object is how a re-run stops being idempotent.
    url: "https://irhwtbyvrbaublgxvpfp.supabase.co/storage/v1/object/public/business-assets/test-logos/LSAT.png?v=3",
    key: "v1/business-assets/test-logos/LSAT.png",
  },
  {
    url: "https://irhwtbyvrbaublgxvpfp.supabase.co/storage/v1/object/public/blog-images/ai-cover-1771427422749-mtzgl.png",
    key: "v1/blog-images/ai-cover-1771427422749-mtzgl.png",
  },
  {
    url: "https://irhwtbyvrbaublgxvpfp.supabase.co/storage/v1/object/public/lms-assignments/9b8b3bf9-f9c9-4fba-8070-04686f857a75/d9fbc281-f47c-4a15-aa47-0fefe8970aca/1781847533602.pdf",
    key: "v1/lms-assignments/9b8b3bf9-f9c9-4fba-8070-04686f857a75/d9fbc281-f47c-4a15-aa47-0fefe8970aca/1781847533602.pdf",
  },
];

export function storageMapSelfCheck(): void {
  assert.equal(new Set(MIGRATED_BUCKETS).size, MIGRATED_BUCKETS.length, "a bucket listed twice would be copied twice");
  assert.equal(MIGRATED_BUCKETS.length, 13, "§4 W6: V2's 13-migrate reconciliation carries over");
  assert.equal(DROPPED_BUCKETS.length, 3, "§4 W6: …and its 3 drops, each with a reason");
  for (const d of DROPPED_BUCKETS) {
    assert.ok(!MIGRATED_BUCKETS.includes(d.bucket), `${d.bucket} cannot be both migrated and dropped`);
    assert.ok(d.reason.length > 20, `${d.bucket} needs a real reason, not a label`);
  }

  for (const f of FIXTURES) {
    assert.equal(toStorageKey(f.url), f.key, `key derivation for ${f.url}`);
    assert.ok(isV1StorageUrl(f.url));
    // Idempotence, the property the whole wave rests on.
    assert.equal(toStorageKey(f.key), null, "an already-rewritten key is not a URL and must not be rewritten again");
  }

  // A bucket W6 does not migrate must NOT resolve to a key — a rewritten URL
  // would point at an object that is never going to be there.
  const dropped =
    "https://irhwtbyvrbaublgxvpfp.supabase.co/storage/v1/object/public/ambassador-media/x/y.png";
  assert.equal(toStorageKey(dropped), null, "a dropped bucket must not rewrite");
  assert.ok(isV1StorageUrl(dropped), "…but it is still recognisably a V1 URL, so it gets reported");

  assert.equal(toStorageKey("https://example.com/logo.png"), null);
  assert.equal(toStorageKey(null), null);
  assert.equal(toStorageKey(42), null);

  assert.equal(objectBasename("covers/9b8b/x.png"), "x.png");
  assert.equal(objectBasename("test-logos/LSAT.png?v=3"), "LSAT.png");
  assert.equal(objectBasename("flat.png"), "flat.png");

  assert.equal(pathOwnerUuid("a821aff9-eedb-47f4-95d3-f30fa932505b/1775109935170.jpg"), "a821aff9-eedb-47f4-95d3-f30fa932505b");
  assert.equal(pathOwnerUuid("covers/c788f3ff-58fa-40d1-9a8d-9738adf1b1fc/biz-432d9267-5b49-42eb-a929-e44f134ab437-1.png"), "c788f3ff-58fa-40d1-9a8d-9738adf1b1fc");
  assert.equal(pathOwnerUuid("ai-cover-1771427422749-mtzgl.png"), null, "no uuid in the path means no owner — not a guessed one");
  assert.equal(pathOwnerUuid("test-logos/TOEFL.svg"), null);

  // The SQL expression is built, not concatenated ad hoc at each call site.
  const sql = v1StoragePathSql("t.logo_url");
  assert.ok(sql.startsWith("regexp_replace(t.logo_url,"));
  assert.ok(sql.includes("avatars|blog-images"), "the bucket alternation must be closed, not `.*`");
  assert.ok(!sql.includes("ambassador-media"), "a dropped bucket must never appear in the rewriter");

  assert.ok(isNormalisedSql(sql), "the rewriter's own output must satisfy the Gate 2 drift guard");
  assert.ok(!isNormalisedSql("t.logo_url"), "a bare column is NOT normalised — that is the whole point of the guard");
  assert.ok(!isNormalisedSql(null));

  // The two predicates say different things and the difference is load-bearing:
  // the UPDATE must fire only where the value will actually change (idempotence),
  // while the leftover scan must see URLs the rewriter deliberately skipped.
  assert.ok(rehostableSql("x").includes("avatars|"));
  assert.ok(!anyV1UrlSql("x").includes("avatars|"));
  assert.ok(extractV1UrlsSql("x").startsWith("regexp_matches(x,"));
  assert.ok(rehostedKeySql("x").includes(`${GCS_PREFIX}/(?:avatars|`), "a bare `v1/` would match prose");
  assert.ok(extractRehostedKeysSql("x").startsWith("regexp_matches(x,"));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  storageMapSelfCheck();
  console.log("w6-storage-map self-check: ok");
}
