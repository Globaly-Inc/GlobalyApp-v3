/**
 * W6 — the object copy and the storage-completeness gate (Part 3 §4 W6, §9).
 *
 * THIS HALF HAS NEVER RUN, AND CANNOT RUN YET. V1's objects are reachable only
 * through the `migration-export` edge function, which needs a fresh 90-day
 * `gmig_` Bearer token, and §7 decision 7 mints that at rehearsal #1. Nothing in
 * this file has ever made a network call. What it does instead is be finished:
 * every pure part — the endpoint builders, the key derivation, the bucket->entity
 * mapping — is asserted under `--self-check`, so running it live is a token and
 * two flags, not a rewrite. That is the shape agent W0 gave the Stage-1
 * extractor (`extract.mjs`: one code path, a pg source and an HTTP source) and it
 * is the shape here.
 *
 * It is V2's `migration/storage-migrate.mjs` retargeted, and it keeps V2's two
 * hard-won lessons verbatim:
 *
 *   1. /storage/list IS HIERARCHICAL. An entry with null metadata is a folder,
 *      not a zero-byte file. Listing without recursing finds ~13 "objects" and
 *      declares parity green over nothing.
 *
 *   2. ALWAYS FETCH THROUGH A SIGNED URL. Rehearsal #2 (2026-07-16) chose
 *      public-vs-signed by the TARGET bucket's visibility, which 400s for every
 *      re-scoped bucket — V1's `lms-assignments` is private while V2's is public.
 *      Signing is correct for every object regardless of either side's scope, so
 *      there is no branch here to get wrong.
 *
 * What differs from V2: V3 has ONE GCS bucket and a `uploaded_files` registry, so
 * an object is not migrated until it has both its bytes and its row. Both
 * idempotence checks are independent and cheap — the GCS listing skips re-uploads,
 * `uploaded_files.storage_path UNIQUE` skips re-registrations — so an interrupted
 * copy is fixed by running it again.
 *
 * THE ONE THING THAT IS NOT DECIDED: `uploaded_files.uploaded_by` is NOT NULL and
 * references platform_users. V1 filed most uploads under the uploading auth user
 * (`avatars/<uuid>/…`), and that uuid is V3's platform_users.uuid, so those
 * resolve to a real person. The rest — `blog-images/…`,
 * `business-assets/test-logos/…` — record no uploader anywhere in V1. They are
 * NOT attributed to an arbitrary account: pass `--uploader=<platform_users.id>`
 * to name the migration's own account, or they are reason-coded `unresolved_user`
 * and left for the owner to decide. See the report at the end of a run.
 */

import assert from "node:assert/strict";

import { MigrationError, execWrite, reportUnresolved, type TransformContext } from "./lib.js";
import {
  DROPPED_BUCKETS,
  MIGRATED_BUCKETS,
  gcsKey,
  objectBasename,
  parseObjectUrl,
  pathOwnerUuid,
  extractRehostedKeysSql,
  extractV1UrlsSql,
  rehostableSql,
  rehostedKeySql,
  type V1Object,
} from "./w6-storage-map.js";
import { columnLabel, sweep, type SweepHit } from "./w6-storage-sweep.js";

/** V2's page size for /storage/list. */
const PAGE = 1000;

export interface ObjectFlags {
  /** Base of V1's edge functions, e.g. https://<ref>.supabase.co/functions/v1 */
  functionsUrl: string | null;
  /** The 90-day gmig_ Bearer token. Minted at rehearsal #1 (§7 decision 7). */
  token: string | null;
  /** platform_users.id to own objects V1 recorded no uploader for. */
  uploader: number | null;
  /** Restrict to these buckets. For re-running one bucket after a failure. */
  buckets: string[] | null;
}

export function parseObjectFlags(args: readonly string[]): ObjectFlags {
  const flags: ObjectFlags = { functionsUrl: null, token: null, uploader: null, buckets: null };
  for (const arg of args) {
    if (arg.startsWith("--functions-url=")) flags.functionsUrl = arg.slice(16).replace(/\/+$/, "");
    else if (arg.startsWith("--token=")) flags.token = arg.slice(8);
    else if (arg.startsWith("--uploader=")) flags.uploader = Number(arg.slice(11));
    else if (arg.startsWith("--buckets=")) {
      flags.buckets = arg
        .slice(10)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  if (flags.uploader !== null && !Number.isInteger(flags.uploader)) {
    throw new MigrationError("--uploader must be a platform_users.id (integer)");
  }
  if (flags.buckets) {
    const unknown = flags.buckets.filter((b) => !MIGRATED_BUCKETS.includes(b));
    if (unknown.length) {
      throw new MigrationError(
        `--buckets names ${unknown.join(", ")}, which W6 does not migrate. Migrated: ${MIGRATED_BUCKETS.join(", ")}`,
      );
    }
  }
  return flags;
}

/** The buckets this run covers. */
export function selectedBuckets(flags: ObjectFlags): readonly string[] {
  return flags.buckets ?? MIGRATED_BUCKETS;
}

// ── Endpoints (pure) ────────────────────────────────────────────────────────

export function listEndpoint(base: string, bucket: string, prefix: string, limit: number, offset: number): string {
  return (
    `${base}/migration-export/storage/list?bucket=${encodeURIComponent(bucket)}` +
    `&prefix=${encodeURIComponent(prefix)}&limit=${limit}&offset=${offset}`
  );
}

export function signEndpoint(base: string, bucket: string, path: string): string {
  return (
    `${base}/migration-export/storage/signed-url?bucket=${encodeURIComponent(bucket)}` +
    `&path=${encodeURIComponent(path)}`
  );
}

// ── uploaded_files derivation (pure) ────────────────────────────────────────

export type OwnerKind = "platform_user" | "business" | null;

export interface RegistryEntry {
  entity_type: string;
  entity_id: string;
  category: string;
  original_name: string;
}

/**
 * The `uploaded_files` row for a migrated object, from the object alone.
 *
 * Everything here is derived, never invented. The entity is the uuid V1 filed the
 * object under, classified by which V3 table that uuid actually resolves to
 * (`ownerKind`, looked up, not guessed). An object with no uuid in its path gets
 * its bucket as the entity — truthful provenance rather than a fabricated owner,
 * and it keeps the row out of `listFilesByEntity` results for entities it does
 * not belong to. `category` is the V1 bucket for the same reason: V3's own
 * categories (profile / logo / cover / gallery / document) describe an upload
 * flow this object never went through.
 */
export function registryEntry(object: V1Object, ownerKind: OwnerKind): RegistryEntry {
  const owner = pathOwnerUuid(object.path);
  return {
    entity_type: owner && ownerKind ? ownerKind : "v1_bucket",
    entity_id: owner && ownerKind ? owner : object.bucket,
    category: object.bucket,
    original_name: objectBasename(object.path),
  };
}

// ── The V1 source (network; never called offline) ────────────────────────────

export interface SourceObject extends V1Object {
  size: number;
  mime: string | null;
}

function requireSource(flags: ObjectFlags): { base: string; token: string } {
  const missing: string[] = [];
  if (!flags.functionsUrl) missing.push("--functions-url=<https://<ref>.supabase.co/functions/v1>");
  if (!flags.token) missing.push("--token=<gmig_…>");
  if (missing.length) {
    throw new MigrationError(
      `W6's object copy needs V1's migration-export function: ${missing.join(" ")}. ` +
        `The gmig_ token does not exist yet — §7 decision 7 mints it at rehearsal #1, and the 90-day ` +
        `clock starts then. Until it exists this half CANNOT be verified and must not be reported as passing. ` +
        `The URL-rewrite half runs offline: drop --objects.`,
    );
  }
  return { base: flags.functionsUrl!, token: flags.token! };
}

/**
 * Every object in a bucket, recursively.
 *
 * V2's lesson 1: /storage/list is hierarchical. `metadata === null` means folder,
 * and a non-recursive listing silently returns a dozen directory entries and
 * calls that the bucket.
 */
async function listAll(base: string, token: string, bucket: string, prefix = ""): Promise<SourceObject[]> {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const out: SourceObject[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = listEndpoint(base, bucket, prefix, PAGE, offset);
    const res = await fetch(url, auth);
    if (!res.ok) throw new MigrationError(`list ${bucket}/${prefix} @${offset}: HTTP ${res.status}`);
    const objects = ((await res.json()) as { objects?: { name: string; metadata?: { size?: number; mimetype?: string } | null }[] })
      .objects ?? [];
    for (const o of objects) {
      const full = prefix ? `${prefix}/${o.name}` : o.name;
      if (o.metadata) out.push({ bucket, path: full, size: Number(o.metadata.size ?? 0), mime: o.metadata.mimetype ?? null });
      else out.push(...(await listAll(base, token, bucket, full)));
    }
    if (objects.length < PAGE) break;
  }
  return out;
}

/** V2's lesson 2: always sign. No public-URL branch exists here to get wrong. */
async function download(base: string, token: string, object: V1Object): Promise<Buffer> {
  const res = await fetch(signEndpoint(base, object.bucket, object.path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new MigrationError(`signed-url ${object.bucket}/${object.path}: HTTP ${res.status}`);
  const { url } = (await res.json()) as { url: string };
  const blob = await fetch(url);
  if (!blob.ok) throw new MigrationError(`download ${object.bucket}/${object.path}: HTTP ${blob.status}`);
  return Buffer.from(await blob.arrayBuffer());
}

// ── The V3 target (GCS; imported lazily so offline work needs no credentials) ─

/** Every object under the `v1/` prefix, with its size. Keys and bytes both come from here. */
type GcsStat = Map<string, number>;

interface GcsTarget {
  upload: (key: string, body: Buffer, mime: string) => Promise<void>;
  stat: () => Promise<GcsStat>;
}

/** Per-bucket byte total, from one listing. §9's "bytes per bucket". */
export function bytesUnder(stat: GcsStat, bucket: string): number {
  let bytes = 0;
  for (const [key, size] of stat) if (key.startsWith(`v1/${bucket}/`)) bytes += size;
  return bytes;
}

async function gcsBucket(): Promise<GcsTarget> {
  const name = process.env.GCS_BUCKET_NAME;
  if (!name) throw new MigrationError("GCS_BUCKET_NAME is not set — W6 uploads into V3's single storage bucket");
  // Lazy on purpose: the rewrite half, --inventory and --self-check must not need
  // GCS credentials or the backend's env schema to be present.
  const { uploadFile } = await import("../../src/shared/storage/storageService.js");
  const { Storage } = await import("@google-cloud/storage");
  const storage = new Storage({
    ...(process.env.GCS_PROJECT_ID ? { projectId: process.env.GCS_PROJECT_ID } : {}),
    ...(process.env.GCS_KEY_FILE ? { keyFilename: process.env.GCS_KEY_FILE } : {}),
  });
  return {
    // No validateFile(): its allow-list governs what V3 ACCEPTS from a client
    // today. An object V1 already holds is history, and refusing to carry it
    // would be data loss dressed up as validation.
    upload: async (key, body, mime) => {
      await uploadFile(key, body, mime);
    },
    stat: async () => {
      const [files] = await storage.bucket(name).getFiles({ prefix: "v1/" });
      const stat: GcsStat = new Map();
      for (const f of files) {
        if (f.name.endsWith("/")) continue; // directory placeholder, not an object
        stat.set(f.name, Number(f.metadata.size ?? 0));
      }
      return stat;
    },
  };
}

// ── Owner resolution ────────────────────────────────────────────────────────

interface Owners {
  users: Map<string, number>;
  businesses: Set<string>;
}

async function resolveOwners(ctx: TransformContext, uuids: readonly string[]): Promise<Owners> {
  if (uuids.length === 0) return { users: new Map(), businesses: new Set() };
  const list = [...new Set(uuids)];
  const { rows: users } = await ctx.db.query<{ uuid: string; id: number }>(
    `SELECT lower(uuid::text) AS uuid, id FROM public.platform_users WHERE lower(uuid::text) = ANY($1::text[])`,
    [list],
  );
  const { rows: businesses } = await ctx.db.query<{ uuid: string }>(
    `SELECT lower(v1_business_id::text) AS uuid FROM mig.map_businesses WHERE lower(v1_business_id::text) = ANY($1::text[])`,
    [list],
  );
  return {
    users: new Map(users.map((r) => [r.uuid, r.id])),
    businesses: new Set(businesses.map((r) => r.uuid)),
  };
}

function ownerKind(owner: string | null, owners: Owners): OwnerKind {
  if (!owner) return null;
  if (owners.users.has(owner)) return "platform_user";
  if (owners.businesses.has(owner)) return "business";
  return null;
}

// ── The copy ────────────────────────────────────────────────────────────────

/**
 * Copy every V1 object into GCS and register it, skipping what is already there.
 *
 * Without `--apply` this is a PRE-FLIGHT: it lists V1 and GCS and says what it
 * would do, and downloads nothing. That is deliberate — a dry run that uploaded
 * to GCS could not be rolled back by the surrounding transaction, so "dry run
 * writes nothing" would become a lie the one time it mattered.
 */
export async function copyObjects(
  ctx: TransformContext,
  flags: ObjectFlags,
  allowedCodes: ReadonlySet<string>,
): Promise<void> {
  const { base, token } = requireSource(flags);
  const buckets = selectedBuckets(flags);

  const plan: SourceObject[] = [];
  for (const bucket of buckets) plan.push(...(await listAll(base, token, bucket)));

  const gcs = await gcsBucket();
  const present = await gcs.stat();
  const { rows: registered } = await ctx.db.query<{ storage_path: string }>(
    `SELECT storage_path FROM public.uploaded_files WHERE storage_path = ANY($1::text[])`,
    [plan.map((o) => gcsKey(o))],
  );
  const inRegistry = new Set(registered.map((r) => r.storage_path));

  const owners = await resolveOwners(ctx, plan.map((o) => pathOwnerUuid(o.path)).filter((u): u is string => !!u));

  const perBucket = new Map<string, { objects: number; bytes: number; toUpload: number; toRegister: number }>();
  for (const o of plan) {
    const key = gcsKey(o);
    const b = perBucket.get(o.bucket) ?? { objects: 0, bytes: 0, toUpload: 0, toRegister: 0 };
    b.objects += 1;
    b.bytes += o.size;
    if (!present.has(key)) b.toUpload += 1;
    if (!inRegistry.has(key)) b.toRegister += 1;
    perBucket.set(o.bucket, b);
  }
  for (const [bucket, b] of perBucket) {
    ctx.report.notes.push(
      `${bucket}: ${b.objects} object(s), ${b.bytes} byte(s) — ${b.toUpload} to upload, ${b.toRegister} to register`,
    );
  }

  if (!ctx.apply) {
    ctx.report.notes.push(
      `PRE-FLIGHT ONLY — nothing downloaded or uploaded. Re-run with --apply to copy. ` +
        `GCS uploads are outside the transaction (they cannot be rolled back), which is exactly why ` +
        `a dry run does not perform them.`,
    );
    return;
  }

  for (const o of plan) {
    const key = gcsKey(o);
    const mime = o.mime ?? "application/octet-stream";
    if (!present.has(key)) {
      await gcs.upload(key, await download(base, token, o), mime);
      ctx.report.written["gcs objects"] = (ctx.report.written["gcs objects"] ?? 0) + 1;
    }
    if (inRegistry.has(key)) continue;

    const owner = pathOwnerUuid(o.path);
    const kind = ownerKind(owner, owners);
    const uploadedBy = (owner && owners.users.get(owner)) ?? flags.uploader ?? null;
    if (uploadedBy === null) {
      await reportUnresolved(
        ctx,
        {
          sourceTable: "v1_storage",
          sourceKey: `${o.bucket}/${o.path}`,
          targetTable: "public.uploaded_files",
          column: "uploaded_by",
          reasonCode: "unresolved_user",
          detail:
            `V1 records no uploading user for this object (no platform_users uuid in its path) and ` +
            `uploaded_files.uploaded_by is NOT NULL. The bytes are in GCS; the registry row is not. ` +
            `Pass --uploader=<platform_users.id> to attribute it, rather than picking an account for the owner.`,
        },
        allowedCodes,
      );
      continue;
    }

    const entry = registryEntry(o, kind);
    await execWrite(
      ctx,
      "public.uploaded_files",
      `INSERT INTO public.uploaded_files
         (uploaded_by, entity_type, entity_id, category, original_name, storage_path, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (storage_path) DO NOTHING`,
      [uploadedBy, entry.entity_type, entry.entity_id, entry.category, entry.original_name, key, mime, o.size],
    );
  }
}

// ── The storage-completeness gate (§9) ──────────────────────────────────────

type Verdict = "PASS" | "FAIL" | "NOT VERIFIED";

interface Check {
  name: string;
  verdict: Verdict;
  detail: string;
}

/**
 * §9: "storage completeness by storage-migrate verify (count+bytes per bucket) +
 * an uploaded_files row per object."
 *
 * Four checks, and two of them CANNOT run without the `gmig_` token. Those report
 * NOT VERIFIED — never PASS, and never quietly omitted, because a gate that
 * reads green for a copy that has not happened is worse than no gate. The overall
 * verdict is green only when all four are PASS, and this throws otherwise so the
 * exit code says the same thing as the text.
 */
export async function verifyStorage(ctx: TransformContext, flags: ObjectFlags): Promise<void> {
  const checks: Check[] = [];

  // 3 and 4 first: they need no token, so the offline half of the gate is real
  // even today.
  const stillUrls = await sweep(ctx, { predicate: rehostableSql, extract: extractV1UrlsSql });
  checks.push({
    name: "no rehostable V1 storage URL left in V3",
    verdict: stillUrls.length === 0 ? "PASS" : "FAIL",
    detail:
      stillUrls.length === 0
        ? "every referring column has been rewritten to a GCS key"
        : stillUrls.map((h) => `${columnLabel(h)}: ${h.rows} row(s)`).join("; "),
  });

  const keys = await rehostedKeys(ctx);
  const registeredKeys = await registeredIn(ctx, [...keys]);
  const unregistered = [...keys].filter((k) => !registeredKeys.has(k));
  // "Not one of them is registered" is the copy not having run; "some are" is a
  // partial copy. Those are different situations and only the second is a defect,
  // so they are not both called FAIL. Neither is called a pass.
  const registryVerdict: Verdict =
    keys.size === 0 ? "NOT VERIFIED" : unregistered.length === 0 ? "PASS" : registeredKeys.size === 0 ? "NOT VERIFIED" : "FAIL";
  checks.push({
    name: "every rewritten path has an uploaded_files row",
    verdict: registryVerdict,
    detail:
      keys.size === 0
        ? "no rewritten paths found — the URL rewrite has not run against this database"
        : `${registeredKeys.size} of ${keys.size} registered` +
          (registeredKeys.size === 0 ? " — the object copy has not run at all" : "") +
          (unregistered.length ? `; missing e.g. ${unregistered.slice(0, 3).join(", ")}` : ""),
  });

  // 1 and 2: the token-bound half.
  if (!flags.functionsUrl || !flags.token) {
    const why =
      "no gmig_ token — §7 decision 7 mints it at rehearsal #1, so the object copy has not run and " +
      "its parity is UNKNOWN, not green";
    checks.push({ name: "object parity per bucket (count + bytes)", verdict: "NOT VERIFIED", detail: why });
    checks.push({ name: "an uploaded_files row per V1 object", verdict: "NOT VERIFIED", detail: why });
  } else {
    const gcs = await gcsBucket();
    const target = await gcs.stat();
    const parity: string[] = [];
    const missingRows: string[] = [];
    let bad = 0;
    for (const bucket of selectedBuckets(flags)) {
      const objects = await listAll(flags.functionsUrl, flags.token, bucket);
      const sourceCount = objects.length;
      const sourceBytes = objects.reduce((n, o) => n + o.size, 0);
      // Counted on the TARGET side, not by assuming the upload loop was right:
      // every key under this bucket's prefix in GCS, and the bytes GCS reports.
      const targetCount = [...target.keys()].filter((k) => k.startsWith(`v1/${bucket}/`)).length;
      const targetBytes = bytesUnder(target, bucket);
      if (targetCount !== sourceCount || targetBytes !== sourceBytes) {
        bad += 1;
        parity.push(`${bucket}: count ${sourceCount}/${targetCount} bytes ${sourceBytes}/${targetBytes}`);
      }
      const registered = await registeredIn(ctx, objects.map((o) => gcsKey(o)));
      for (const o of objects) if (!registered.has(gcsKey(o))) missingRows.push(gcsKey(o));
    }
    checks.push({
      name: "object parity per bucket (count + bytes)",
      verdict: bad === 0 ? "PASS" : "FAIL",
      detail: bad === 0 ? `${selectedBuckets(flags).length} bucket(s) match exactly` : parity.join("; "),
    });
    checks.push({
      name: "an uploaded_files row per V1 object",
      verdict: missingRows.length === 0 ? "PASS" : "FAIL",
      detail: missingRows.length === 0 ? "every object is registered" : `${missingRows.length} object(s) unregistered`,
    });
  }

  console.log("W6 storage completeness (Part 3 §9):");
  for (const c of checks) console.log(`  [${c.verdict.padEnd(12)}] ${c.name} — ${c.detail}`);
  for (const d of DROPPED_BUCKETS) console.log(`  [n/a         ] ${d.bucket} not migrated — ${d.reason}`);

  const failed = checks.filter((c) => c.verdict === "FAIL");
  const unknown = checks.filter((c) => c.verdict === "NOT VERIFIED");
  if (failed.length || unknown.length) {
    throw new MigrationError(
      `STORAGE ${failed.length ? "PARITY FAILED" : "NOT VERIFIED"} — ` +
        `${failed.length} check(s) failed, ${unknown.length} could not be checked. ` +
        `Do NOT decommission V1: §8's live-supabase-URL risk is still open.`,
    );
  }
  ctx.report.notes.push("storage completeness GREEN — all four §9 checks pass");
}

/** Every GCS key the rewrite wrote into a V3 column. */
async function rehostedKeys(ctx: TransformContext): Promise<Set<string>> {
  const hits: SweepHit[] = await sweep(ctx, { predicate: rehostedKeySql, extract: extractRehostedKeysSql });
  const keys = new Set<string>();
  for (const h of hits) for (const k of h.values.keys()) keys.add(k);
  return keys;
}

async function registeredIn(ctx: TransformContext, keys: readonly string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const { rows } = await ctx.db.query<{ storage_path: string }>(
    `SELECT storage_path FROM public.uploaded_files WHERE storage_path = ANY($1::text[])`,
    [[...new Set(keys)]],
  );
  return new Set(rows.map((r) => r.storage_path));
}

// ── Self-check ──────────────────────────────────────────────────────────────

export function objectsSelfCheck(): void {
  // Endpoints. V2's contract, and the encoding that keeps a path with a space or
  // a `+` in it from becoming a different path.
  const base = "https://ref.supabase.co/functions/v1";
  assert.equal(
    listEndpoint(base, "avatars", "covers/x", 1000, 0),
    `${base}/migration-export/storage/list?bucket=avatars&prefix=covers%2Fx&limit=1000&offset=0`,
  );
  assert.equal(
    signEndpoint(base, "business-assets", "test-logos/LSAT.png"),
    `${base}/migration-export/storage/signed-url?bucket=business-assets&path=test-logos%2FLSAT.png`,
  );

  // Flags.
  assert.deepEqual(parseObjectFlags(["--functions-url=https://x/functions/v1/", "--token=gmig_1", "--uploader=41"]), {
    functionsUrl: "https://x/functions/v1",
    token: "gmig_1",
    uploader: 41,
    buckets: null,
  });
  assert.throws(() => parseObjectFlags(["--uploader=nope"]), /platform_users\.id/);
  assert.throws(() => parseObjectFlags(["--buckets=ambassador-media"]), /does not migrate/);
  assert.deepEqual(parseObjectFlags(["--buckets=avatars,blog-images"]).buckets, ["avatars", "blog-images"]);
  assert.equal(selectedBuckets(parseObjectFlags([])).length, MIGRATED_BUCKETS.length);

  // The registry row. An owner uuid that resolves is used; one that does not is
  // NOT turned into a platform_user id nobody checked.
  const avatar: V1Object = { bucket: "avatars", path: "a821aff9-eedb-47f4-95d3-f30fa932505b/1775109935170.jpg" };
  assert.deepEqual(registryEntry(avatar, "platform_user"), {
    entity_type: "platform_user",
    entity_id: "a821aff9-eedb-47f4-95d3-f30fa932505b",
    category: "avatars",
    original_name: "1775109935170.jpg",
  });
  assert.deepEqual(registryEntry(avatar, null), {
    entity_type: "v1_bucket",
    entity_id: "avatars",
    category: "avatars",
    original_name: "1775109935170.jpg",
  });
  const logo: V1Object = { bucket: "business-assets", path: "test-logos/TOEFL.svg" };
  assert.deepEqual(registryEntry(logo, null), {
    entity_type: "v1_bucket",
    entity_id: "business-assets",
    category: "business-assets",
    original_name: "TOEFL.svg",
  });

  // Owner classification is a lookup, not a shape test.
  const owners: Owners = { users: new Map([["u", 7]]), businesses: new Set(["b"]) };
  assert.equal(ownerKind("u", owners), "platform_user");
  assert.equal(ownerKind("b", owners), "business");
  assert.equal(ownerKind("neither", owners), null);
  assert.equal(ownerKind(null, owners), null);

  // The copy must refuse to start without a token, and say why in a way that
  // names the decision rather than the symptom.
  assert.throws(() => requireSource({ functionsUrl: null, token: null, uploader: null, buckets: null }), /rehearsal #1/);
  assert.throws(() => requireSource({ functionsUrl: "https://x", token: null, uploader: null, buckets: null }), /--token=/);
  assert.doesNotThrow(() => requireSource({ functionsUrl: "https://x", token: "gmig_1", uploader: null, buckets: null }));

  // §9's "bytes per bucket", from one listing: prefix-scoped, and not fooled by
  // another bucket whose name starts with the same letters.
  const stat: GcsStat = new Map([
    ["v1/avatars/a.jpg", 10],
    ["v1/avatars/covers/b.png", 20],
    ["v1/avatars-old/c.png", 40],
    ["v1/blog-images/d.png", 30],
  ]);
  assert.equal(bytesUnder(stat, "avatars"), 30);
  assert.equal(bytesUnder(stat, "blog-images"), 30);
  assert.equal(bytesUnder(stat, "chat-attachments"), 0, "an empty bucket is 0 bytes, not an error");

  // The key an object lands on is the one the rewriter produces for its URL —
  // if these two ever diverge the copy uploads to a path nothing points at.
  const url = "https://irhwtbyvrbaublgxvpfp.supabase.co/storage/v1/object/public/avatars/covers/x/y.png";
  assert.equal(gcsKey(parseObjectUrl(url)!), "v1/avatars/covers/x/y.png");
}
