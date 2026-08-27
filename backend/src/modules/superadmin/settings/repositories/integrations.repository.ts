import { masterKnex } from "../../../../core/db/master-pool.js";
import { seal, open } from "../../../../shared/crypto/secret-box.js";
import type { IntegrationKey } from "../schemas/integrations.schema.js";

const TABLE = "superadmin.integration_settings";

export async function upsert(key: IntegrationKey, plaintext: string, updatedBy: number | null): Promise<void> {
  await masterKnex(TABLE)
    .insert({ key, value: seal(plaintext), updated_by: updatedBy })
    .onConflict("key")
    .merge({ value: seal(plaintext), updated_by: updatedBy, updated_at: masterKnex.fn.now() });
}

export async function remove(key: IntegrationKey): Promise<void> {
  await masterKnex(TABLE).where({ key }).delete();
}

/** null = unset. Throws only on undecryptable rows (e.g. JWT_SECRET rotated) — callers decide. */
export async function get(key: IntegrationKey): Promise<string | null> {
  const row = await masterKnex(TABLE).where({ key }).first<{ value: string } | undefined>();
  return row ? open(row.value) : null;
}

export async function listKeysWithMeta(): Promise<Array<{ key: string; updated_at: string }>> {
  return masterKnex(TABLE).select("key", "updated_at");
}
