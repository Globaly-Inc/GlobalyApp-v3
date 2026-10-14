/**
 * One-off: re-encrypts superadmin.integration_settings after JWT_SECRET was rotated.
 *
 * secret-box derives its key from JWT_SECRET, so rotating it leaves every stored integration
 * (Higgsfield/Pexels keys, Search Console, GlobalyOS CRM) unreadable. This opens each row with
 * the OLD secret and seals it again with the current one. Rows that already open with the current
 * secret are skipped, so it is safe to re-run.
 *
 *   OLD_JWT_SECRET='<old value>' node --import tsx scripts/reseal-integration-settings.ts           dry run
 *   OLD_JWT_SECRET='<old value>' node --import tsx scripts/reseal-integration-settings.ts --apply   writes
 */
import "dotenv/config";
import { createDecipheriv, createHash } from "node:crypto";
import { masterKnex } from "../src/core/db/master-pool.js";
import { open, seal } from "../src/shared/crypto/secret-box.js";

const apply = process.argv.includes("--apply");
const oldSecret = process.env.OLD_JWT_SECRET;

/** secret-box's open(), with the key derived from a secret other than config.JWT_SECRET. */
function openWith(secret: string, sealed: string): string {
  const key = createHash("sha256").update(`${secret}:integration-settings`).digest();
  const [v, iv, tag, data] = sealed.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("bad format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

function opensWithCurrent(sealed: string): boolean {
  try {
    open(sealed);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!oldSecret) throw new Error("Set OLD_JWT_SECRET to the JWT_SECRET the rows were sealed with.");
  const rows = await masterKnex("superadmin.integration_settings").select<{ key: string; value: string }[]>("key", "value");
  let failed = 0;
  for (const row of rows) {
    if (opensWithCurrent(row.value)) {
      console.log(`ok       ${row.key} (already readable)`);
      continue;
    }
    let plaintext: string;
    try {
      plaintext = openWith(oldSecret, row.value);
    } catch {
      failed++;
      console.log(`FAILED   ${row.key} (not readable with OLD_JWT_SECRET either; re-enter it in Settings → Integrations)`);
      continue;
    }
    console.log(`${apply ? "resealed" : "would reseal"} ${row.key}`);
    if (apply) {
      await masterKnex("superadmin.integration_settings")
        .where({ key: row.key })
        .update({ value: seal(plaintext), updated_at: masterKnex.fn.now() });
    }
  }
  if (!apply) console.log("Dry run — pass --apply to write.");
  await masterKnex.destroy();
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
