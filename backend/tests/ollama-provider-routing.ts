/**
 * Provider-routing gates for the self-hosted Ollama fallback.
 * Run: node --import tsx tests/ollama-provider-routing.ts
 *
 * Guards the three hops staying distinct: Ollama (primary, LLM_PRIMARY=ollama) → Gemini →
 * OpenRouter (fallback). isORConfigured() means *OpenRouter specifically*, and embeddings need it
 * too — Ollama serves chat only, since EMBEDDING_DIMS is 3072 and its embed models are 768/1024.
 * Widening either gate to count Ollama silently breaks embeddings and collapses the third hop.
 *
 * config.ts freezes env at import, so each row runs in its own child process (this same file,
 * re-invoked with `child`). Not covered: the actual baseURL/model handed to the OpenAI SDK — those
 * are module-private and only observable on a live call. The curl smoke test covers that. Nor the
 * `committed` guard in tryPrimary() — that needs a stream that fails mid-flight.
 */

import "dotenv/config";
import { spawnSync } from "node:child_process";

const STUB = { DB_USERNAME: "x", DB_PASSWORD: "x", DB_NAME: "x", JWT_SECRET: "x" };
const OLLAMA = "https://model.globalyapp.com/v1";

if (process.argv[2] === "child") {
  const { isORConfigured, isORPrimary } = await import("../src/shared/ai/openrouter.js");
  const { isEmbedConfigured } = await import("../src/modules/superadmin/data-extraction/lib/llm-client.js");
  process.stdout.write(JSON.stringify({ or: isORConfigured(), embed: isEmbedConfigured(), primary: isORPrimary() }));
  process.exit(0);
}

type Row = { label: string; env: Record<string, string>; or: boolean; embed: boolean; primary: boolean };

const rows: Row[] = [
  { label: "openrouter only",              env: { OPENROUTER_API_KEY: "sk-or" },                                    or: true,  embed: true,  primary: false },
  // Ollama must never satisfy the OpenRouter gates: it is not a fallback and cannot embed.
  { label: "ollama only, embed=openrouter", env: { OLLAMA_BASE_URL: OLLAMA, OLLAMA_API_KEY: "sk-x" },               or: false, embed: false, primary: false },
  { label: "ollama + openrouter",          env: { OLLAMA_BASE_URL: OLLAMA, OPENROUTER_API_KEY: "sk-or" },           or: true,  embed: true,  primary: false },
  { label: "ollama only, embed=gemini",    env: { OLLAMA_BASE_URL: OLLAMA, GEMINI_API_KEY: "g", EMBEDDING_PROVIDER: "gemini" }, or: false, embed: true, primary: false },
  { label: "nothing configured",           env: {},                                                                 or: false, embed: false, primary: false },
  // LLM_PRIMARY: the testing switch that puts Ollama ahead of Gemini instead of behind it.
  // All three hops live: Ollama primary, Gemini middle, OpenRouter fallback.
  { label: "all three hops",               env: { OLLAMA_BASE_URL: OLLAMA, OPENROUTER_API_KEY: "sk-or", LLM_PRIMARY: "ollama" }, or: true, embed: true, primary: true },
  // Primary on, third hop absent — chain degrades to Ollama → Gemini, and embeddings go down with it.
  { label: "primary=ollama, no fallback",  env: { OLLAMA_BASE_URL: OLLAMA, LLM_PRIMARY: "ollama" },                  or: false, embed: false, primary: true },
  // Guard: the switch must not promote a provider that has no base URL.
  { label: "primary=ollama, no base URL",  env: { OPENROUTER_API_KEY: "sk-or", LLM_PRIMARY: "ollama" },              or: true,  embed: true,  primary: false },
  { label: "primary=gemini, ollama set",   env: { OLLAMA_BASE_URL: OLLAMA, OPENROUTER_API_KEY: "sk-or", LLM_PRIMARY: "gemini" }, or: true, embed: true, primary: false },
];

let failed = 0;
// Blanked, not deleted: config.ts runs `dotenv/config` in the child, and dotenv backfills any key
// missing from process.env — so deleting these would silently restore the real .env values.
const BLANK = { OPENROUTER_API_KEY: "", OLLAMA_BASE_URL: "", OLLAMA_API_KEY: "", GEMINI_API_KEY: "" };
// Enum-valued vars cannot be blanked ("" fails zod), so they get an explicit default each row overrides.
const ENUMS = { EMBEDDING_PROVIDER: "openrouter", LLM_PRIMARY: "gemini" };

for (const row of rows) {
  const env = { ...process.env, ...STUB, ...BLANK, ...ENUMS };
  const res = spawnSync(process.execPath, ["--import", "tsx", import.meta.filename, "child"], {
    env: { ...env, ...row.env }, encoding: "utf8",
  });
  if (res.status !== 0) {
    console.error(`FAIL ${row.label}: child exited ${res.status}\n${res.stderr}`);
    failed++;
    continue;
  }
  const got = JSON.parse(res.stdout) as { or: boolean; embed: boolean };
  for (const key of ["or", "embed", "primary"] as const) {
    if (got[key] === row[key]) continue;
    console.error(`FAIL ${row.label}: ${key} expected ${row[key]}, got ${got[key]}`);
    failed++;
  }
}

console.log(failed === 0 ? `PASS — ${rows.length} provider-routing rows` : `${failed} assertion(s) failed`);
process.exit(failed === 0 ? 0 : 1);
