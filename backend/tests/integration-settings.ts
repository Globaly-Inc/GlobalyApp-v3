// Integration settings: seal/open round-trip, DB round-trip, env fallback, cache bust.
// Guard: refuses non-_test DB (fixtures are cleaned up, but stay consistent with the other suites).
import "dotenv/config";
import { seal, open } from "../src/shared/crypto/secret-box.js";
import { masterKnex } from "../src/core/db/master-pool.js";
import * as repo from "../src/modules/superadmin/settings/repositories/integrations.repository.js";
import { getIntegrationSetting, bustCache } from "../src/modules/superadmin/settings/services/integration-settings.service.js";

if (!process.env.DB_NAME?.endsWith("_test")) {
  console.error('REFUSING TO RUN.\n\n  DB_NAME must end in "_test". Use: DB_NAME=globalyapp_test npm run test:integration-settings');
  process.exit(1);
}

let passed = 0;
let failed = 0;
function check(id: string, desc: string, ok: boolean, err?: unknown) {
  if (ok) { passed++; console.log(`  PASS ${id}  ${desc}`); }
  else { failed++; console.log(`  FAIL ${id}  ${desc}${err ? ` — ${err}` : ""}`); }
}

(async () => {
  console.log("Integration settings tests");

  // T1: crypto round-trip + tamper detection
  const secret = "hf_key:hf_secret_αβγ";
  check("T1a", "seal/open round-trip", open(seal(secret)) === secret);
  check("T1b", "two seals of same value differ (fresh IV)", seal(secret) !== seal(secret));
  let tampered = false;
  try { open(seal(secret).slice(0, -4) + "AAAA"); } catch { tampered = true; }
  check("T1c", "tampered ciphertext throws", tampered);

  // T2: DB round-trip + ciphertext at rest
  await repo.upsert("higgsfield_api_key", secret, null);
  check("T2a", "repo.get returns plaintext", (await repo.get("higgsfield_api_key")) === secret);
  const raw = await masterKnex("superadmin.integration_settings").where({ key: "higgsfield_api_key" }).first();
  check("T2b", "stored value is ciphertext, not plaintext", raw.value.startsWith("v1:") && !raw.value.includes("hf_key"));

  // T3: service reads DB value; falls back to env when unset
  bustCache();
  check("T3a", "service returns DB value", (await getIntegrationSetting("higgsfield_api_key")) === secret);
  await repo.remove("higgsfield_api_key");
  bustCache();
  process.env.HIGGSFIELD_API_KEY = "env-fallback-key";
  check("T3b", "service falls back to env after delete", (await getIntegrationSetting("higgsfield_api_key")) === "env-fallback-key");
  delete process.env.HIGGSFIELD_API_KEY;
  bustCache();
  check("T3c", "null when neither DB nor env set", (await getIntegrationSetting("higgsfield_api_key")) === null);

  // cleanup
  await masterKnex("superadmin.integration_settings").delete();
  await masterKnex.destroy();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
