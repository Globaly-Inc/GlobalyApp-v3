/**
 * LLM_PRIMARY decides which provider gets first crack at every AI call. It matters right
 * now because GEMINI_API_KEY returns API_KEY_SERVICE_BLOCKED for the whole
 * generativelanguage API, so leaving Gemini primary makes every request pay a doomed 403.
 *
 * Each option must be gated on its own credential: a value naming an unconfigured provider
 * has to fall through to the normal chain, not fail every request.
 *
 * One child process per case, deliberately: config.ts parses env once at import, so
 * mutating process.env in-process changes nothing and the test would pass vacuously.
 * Run: node --import tsx tests/llm-primary.ts
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const EMPTY_ENV_FILE = join(mkdtempSync(join(tmpdir(), "llm-primary-")), ".env");
writeFileSync(EMPTY_ENV_FILE, "");

let failed = 0;
function assert(ok: boolean, label: string) {
  if (ok) return;
  failed++;
  console.error(`FAIL: ${label}`);
}

/**
 * Resolved provider under the given env, as the running app would see it.
 *
 * `DOTENV_CONFIG_PATH` is pointed at an empty file because config.ts does
 * `import "dotenv/config"`: without it the child re-reads the real .env and puts back the
 * very credential a gating case is trying to remove, so those assertions passed vacuously.
 */
function resolve(env: Record<string, string>): string {
  const script =
    'import("./src/shared/ai/openrouter.js").then((m) => ' +
    'console.log(JSON.stringify({ via: m.primaryProvider() ?? null, orPrimary: m.isORPrimary() })))';
  const out = execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
    // A blank value must reach the child as UNSET, which is what an absent env var is.
    env: {
      ...Object.fromEntries(Object.entries({ ...process.env, ...env }).filter(([, v]) => v !== "")),
      DOTENV_CONFIG_PATH: EMPTY_ENV_FILE,
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out.trim().split("\n").pop() ?? "";
}

function main() {
  const gemini = JSON.parse(resolve({ LLM_PRIMARY: "gemini" }));
  assert(gemini.via === null, "gemini primary → nothing runs before Gemini");
  assert(gemini.orPrimary === false, "gemini primary → isORPrimary false");

  const or = JSON.parse(resolve({ LLM_PRIMARY: "openrouter", OPENROUTER_API_KEY: "sk-test" }));
  assert(or.via === "openrouter", `openrouter primary → OpenRouter first (got ${or.via})`);
  assert(or.orPrimary === true, "openrouter primary → isORPrimary true");

  const ol = JSON.parse(resolve({ LLM_PRIMARY: "ollama", OLLAMA_BASE_URL: "https://model.example.com/v1" }));
  assert(ol.via === "ollama", `ollama primary unchanged (got ${ol.via})`);

  // The gating that stops a typo'd deployment failing every request.
  assert(
    JSON.parse(resolve({ LLM_PRIMARY: "openrouter", OPENROUTER_API_KEY: "" })).via === null,
    "openrouter primary with NO key → falls through to the normal chain",
  );
  assert(
    JSON.parse(resolve({ LLM_PRIMARY: "ollama", OLLAMA_BASE_URL: "" })).via === null,
    "ollama primary with NO base url → falls through to the normal chain",
  );

  console.log(failed === 0 ? "PASS — LLM_PRIMARY resolves per provider and is credential-gated" : `${failed} failure(s)`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
