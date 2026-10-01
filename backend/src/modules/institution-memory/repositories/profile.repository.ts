// Knex access to institution_ai_profile — one row in each institution's OWN schema.
//
// Reuses memory.repository's tenant resolution deliberately: one schema cache, one test seam.
// A second copy of schemaFor() here would mean two caches to clear and a faked connection that
// only covered half the Rack.
//
// Reads never throw. An institution with no provisioned schema, no row, or a row written before
// a field existed all resolve to the same thing — the default profile — because a chat turn must
// never fail over configuration.

import { createChildLogger } from "../../../shared/logger.js";
import * as memoryRepo from "./memory.repository.js";
import {
  DEFAULT_PROFILE, RackProfileSchema, type PatchRackProfileBlocks, type RackProfile,
} from "../schemas/profile.schema.js";

const logger = createChildLogger("institution-rack-profile-repo");

const TABLE = "institution_ai_profile";
const ROW_ID = 1;

export interface StoredProfile {
  profile: RackProfile;
  version: number;
  updated_at: Date | null;
  /** False when nothing has been written yet — the portal shows "using defaults". */
  configured: boolean;
  /**
   * True when these defaults are a GUESS rather than a fact: the read threw, or the stored row
   * did not parse. The difference matters for exactly one consumer — the collection rules.
   *
   * Defaults are a safe answer for voice and behaviour: a database blip should cost a visitor a
   * house style, not a reply. They are NOT a safe answer for permissions. The default allow-list
   * permits eight fields, so an institution that had narrowed it to one would, for the duration
   * of the blip, have the other seven extracted and written. Failing open on a privacy rule is
   * worse than failing the feature, so callers that act on `collection` must check this.
   */
  degraded: boolean;
}

const DEFAULTS: StoredProfile = {
  profile: DEFAULT_PROFILE, version: 0, updated_at: null, configured: false, degraded: false,
};

/**
 * This institution's configuration, or the defaults.
 *
 * The stored jsonb is PARSED, not trusted — the same deliberate exception the memory module
 * makes for model- and admin-written JSONB. A block that fails (hand-edited SQL, a field whose
 * vocabulary changed under it) falls back to that block's defaults rather than putting an
 * unvalidated shape into a system prompt.
 */
export async function get(institutionId: number): Promise<StoredProfile> {
  const k = await memoryRepo.tenantDbOrNull(institutionId);
  if (!k) return DEFAULTS;
  try {
    const row = await k(TABLE).where({ id: ROW_ID }).first();
    if (!row) return DEFAULTS;
    const parsed = RackProfileSchema.safeParse({
      voice: row.voice, behaviour: row.behaviour, collection: row.collection, learning: row.learning,
    });
    if (!parsed.success) {
      // A row exists and we cannot read it. Same hazard as a failed read: the defaults below are
      // not what this institution chose, so anything acting on permissions must not use them.
      logger.warn("Stored rack profile failed its schema; using defaults", {
        institutionId, issues: parsed.error.issues.map((i) => i.path.join(".")),
      });
      return {
        ...DEFAULTS, version: Number(row.version ?? 0), updated_at: row.updated_at ?? null,
        configured: true, degraded: true,
      };
    }
    return {
      profile: parsed.data, version: Number(row.version), updated_at: row.updated_at,
      configured: true, degraded: false,
    };
  } catch (err) {
    // An un-migrated tenant schema is the usual cause. Defaults, not a failed turn.
    logger.warn("Rack profile read failed; using defaults", { institutionId, err: String(err) });
    return { ...DEFAULTS, degraded: true };
  }
}

/**
 * Apply a partial edit, atomically, and only to the blocks it names.
 *
 * Two things this is NOT, and both were bugs:
 *
 *   1. It is not a read-modify-write. patchProfile used to SELECT the profile, merge in JS, and
 *      write all four blocks back — so two members saving at once meant the second write carried
 *      the first's stale blocks. A voice-only save could restore `collection` permissions another
 *      member had just removed, which is a privacy setting silently reverting.
 *   2. It is not a whole-row overwrite. A block absent from the patch is not written at all, so
 *      a save can only ever disturb what it actually edited.
 *
 * Within a block, `||` is a shallow jsonb merge — the right shape here, because every block is
 * flat and the one nested value (`collection.contact_ask`) is edited as a unit.
 *
 * `expectedVersion` is the conflict check: the UPDATE applies only when the stored version is
 * still what the caller read. Zero means "there was no row"; if one has appeared since, the
 * WHERE fails and nothing is written. Returns null in that case — the caller turns it into a 409.
 */
export async function patch(
  institutionId: number,
  input: PatchRackProfileBlocks,
  updatedBy: number | null,
  expectedVersion: number,
): Promise<StoredProfile | null> {
  const k = await memoryRepo.tenantDb(institutionId);
  const block = (v: unknown) => (v === undefined ? null : JSON.stringify(v));
  const blocks = [block(input.voice), block(input.behaviour), block(input.collection), block(input.learning)];

  // Unqualified: the tenant connection's search_path puts this institution's schema first, the
  // same way match_institution_ai_memories resolves.
  const { rows } = await k.raw(
    `INSERT INTO ${TABLE} (id, voice, behaviour, collection, learning, updated_by)
     VALUES (?, COALESCE(?::jsonb, '{}'), COALESCE(?::jsonb, '{}'), COALESCE(?::jsonb, '{}'), COALESCE(?::jsonb, '{}'), ?)
     ON CONFLICT (id) DO UPDATE SET
       voice      = ${TABLE}.voice      || COALESCE(?::jsonb, '{}'),
       behaviour  = ${TABLE}.behaviour  || COALESCE(?::jsonb, '{}'),
       collection = ${TABLE}.collection || COALESCE(?::jsonb, '{}'),
       learning   = ${TABLE}.learning   || COALESCE(?::jsonb, '{}'),
       updated_by = ?,
       version    = ${TABLE}.version + 1,
       updated_at = now()
     WHERE ${TABLE}.version = ?
     RETURNING *`,
    [ROW_ID, ...blocks, updatedBy, ...blocks, updatedBy, expectedVersion],
  );

  const row = rows?.[0];
  if (!row) return null; // someone else saved between the read and this write

  // Parsed, not assumed: this is the same stored shape `get` refuses to trust, and the merge
  // happened in Postgres rather than here, so nothing in this process has seen the result yet.
  const parsed = RackProfileSchema.safeParse({
    voice: row.voice, behaviour: row.behaviour, collection: row.collection, learning: row.learning,
  });
  if (!parsed.success) {
    logger.warn("Saved rack profile failed its schema; serving defaults", {
      institutionId, issues: parsed.error.issues.map((i) => i.path.join(".")),
    });
  }
  return {
    profile: parsed.success ? parsed.data : DEFAULT_PROFILE,
    version: Number(row.version),
    updated_at: row.updated_at,
    configured: true,
    // The write landed either way; `degraded` says whether what we are handing back reflects it.
    degraded: !parsed.success,
  };
}
