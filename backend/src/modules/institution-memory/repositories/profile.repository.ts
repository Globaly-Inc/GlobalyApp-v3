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
import { DEFAULT_PROFILE, RackProfileSchema, type RackProfile } from "../schemas/profile.schema.js";

const logger = createChildLogger("institution-rack-profile-repo");

const TABLE = "institution_ai_profile";
const ROW_ID = 1;

export interface StoredProfile {
  profile: RackProfile;
  version: number;
  updated_at: Date | null;
  /** False when nothing has been written yet — the portal shows "using defaults". */
  configured: boolean;
}

const DEFAULTS: StoredProfile = { profile: DEFAULT_PROFILE, version: 0, updated_at: null, configured: false };

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
      logger.warn("Stored rack profile failed its schema; using defaults", {
        institutionId, issues: parsed.error.issues.map((i) => i.path.join(".")),
      });
      return { ...DEFAULTS, version: Number(row.version ?? 0), updated_at: row.updated_at ?? null, configured: true };
    }
    return { profile: parsed.data, version: Number(row.version), updated_at: row.updated_at, configured: true };
  } catch (err) {
    // An un-migrated tenant schema is the usual cause. Defaults, not a failed turn.
    logger.warn("Rack profile read failed; using defaults", { institutionId, err: String(err) });
    return DEFAULTS;
  }
}

/**
 * Write the whole profile back.
 *
 * Upsert rather than insert-then-update: there is no provisioning step that seeds the row, so
 * the first PATCH from the portal is also the row's creation. `ON CONFLICT (id)` is safe to
 * infer — id is the primary key, and the CHECK pins it to 1.
 */
export async function put(institutionId: number, profile: RackProfile, updatedBy: number | null): Promise<StoredProfile> {
  const k = await memoryRepo.tenantDb(institutionId);
  const [row] = await k(TABLE)
    .insert({
      id: ROW_ID,
      voice: JSON.stringify(profile.voice),
      behaviour: JSON.stringify(profile.behaviour),
      collection: JSON.stringify(profile.collection),
      learning: JSON.stringify(profile.learning),
      updated_by: updatedBy,
    })
    .onConflict("id")
    .merge({
      voice: JSON.stringify(profile.voice),
      behaviour: JSON.stringify(profile.behaviour),
      collection: JSON.stringify(profile.collection),
      learning: JSON.stringify(profile.learning),
      updated_by: updatedBy,
      version: k.raw(`${TABLE}.version + 1`),
      updated_at: k.fn.now(),
    })
    .returning("*");
  return { profile, version: Number(row.version), updated_at: row.updated_at, configured: true };
}
