/**
 * Shared fake wire for the institution-memory test scripts. Same idea as tests/ai-counsellor-flow.ts:
 * knex builds real SQL, the fake sits at acquireConnection and routes each statement to canned
 * rows, so what the tests assert is the SQL the services actually emit — text AND bindings.
 *
 * Import AFTER setting process.env (config.ts reads env once at load).
 */

import { masterKnex } from "../src/core/db/master-pool.js";
import { _memoryDeps } from "../src/modules/institution-memory/repositories/memory.repository.js";
import type { MemoryRow } from "../src/modules/institution-memory/schemas/memory.schema.js";

// The memory table lives in each institution's tenant schema. Every institution resolves to the
// one faked connection here, and the ids asked for are recorded so isolation can be asserted:
// the boundary is WHICH schema a statement went to, not a column in it.
export const tenantRequests: number[] = [];
_memoryDeps.tenantDb = async (institutionId: number) => { tenantRequests.push(institutionId); return masterKnex; };

export let passed = 0;
export let failed = 0;
export function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
}
export async function finish() {
  console.log(`\n${passed} passed, ${failed} failed`);
  await masterKnex.destroy().catch(() => {});
  process.exit(failed ? 1 : 0);
}

export type Stmt = { text: string; values: unknown[] };
export type Route = [RegExp, (stmt: Stmt) => unknown[]];
type PgResponse = { command: string; rows: unknown[]; rowCount?: number };

export const statements: Stmt[] = [];
let routes: Route[] = [];
const commandOf = (t: string) => /^update/i.test(t) ? "UPDATE" : /^insert/i.test(t) ? "INSERT" : /^delete/i.test(t) ? "DELETE" : "SELECT";

const client = masterKnex.client as unknown as { acquireConnection: () => Promise<unknown>; releaseConnection: (c: unknown) => Promise<void> };
client.acquireConnection = async () => ({
  query(q: { text: string; values?: unknown[] }, cb: (err: Error | null, res?: PgResponse) => void) {
    const stmt = { text: q.text, values: q.values ?? [] };
    statements.push(stmt);
    const route = routes.find(([re]) => re.test(q.text));
    let rows: unknown[];
    try { rows = route ? route[1](stmt) : []; } catch (err) { cb(err as Error); return; }
    // knex hands back rows for SELECT/RETURNING and rowCount for a bare UPDATE — the fake must
    // say which it was, or `updated > 0` compares an array to a number.
    cb(null, { command: commandOf(q.text), rows, rowCount: rows.length });
  },
});
client.releaseConnection = async () => {};

export const reset = (r: Route[]) => { statements.length = 0; tenantRequests.length = 0; routes = r; };
export const all = (re: RegExp) => statements.filter((s) => re.test(s.text));
export const count = (re: RegExp) => all(re).length;
export const find = (re: RegExp) => all(re)[0];
/** Values bound by every statement matching `re`, flattened. */
export const bound = (re: RegExp) => all(re).flatMap((s) => s.values);

// ── Embedding endpoint fake (Gemini REST shape) ──────────────────────────────
export const vector = Array.from({ length: 3072 }, (_, i) => (i === 0 ? 1 : 0));
export const embedCalls: string[] = [];
global.fetch = (async (_url: unknown, init?: { body?: string }) => {
  embedCalls.push(String(init?.body ?? ""));
  return { ok: true, json: async () => ({ embedding: { values: vector } }), text: async () => "" } as unknown as Response;
}) as typeof global.fetch;

// ── Fixtures ─────────────────────────────────────────────────────────────────
export const INST = 5;
export const OTHER_INST = 6;
export const ID = "11111111-1111-4111-8111-111111111111";
export const ID2 = "22222222-2222-4222-8222-222222222222";
export const HEX = (n: number) => n.toString(16).padStart(16, "0");

export const row = (o: Partial<MemoryRow> = {}): MemoryRow => ({
  id: ID, institution_id: INST, type: "INSTITUTION_POLICY", content: "Refunds are discussed only after an offer.",
  content_hash: "h", metadata: {}, source: "admin",
  source_reference: { actors: [], positive_voters: [], negative_voters: [] },
  confidence: 1, importance: 3, status: "active", version: 1, reinforce_count: 0, use_count: 0,
  has_embedding: true, flagged_at: null, conflicts_with_id: null, history: [], created_by: null,
  created_at: new Date(), updated_at: new Date(), last_used_at: null, expires_at: null,
  ...o,
});

export const INSERT_MEMORY = /^insert into "institution_ai_memories"/i;
export const UPDATE_MEMORY = /^update "institution_ai_memories"/i;
export const SELECT_MEMORY = /^select .* from "institution_ai_memories"/i;
export const MATCH_FN = /match_institution_ai_memories/;
// The history append also calls jsonb_array_length(history); the promotion predicate is the
// one over source_reference->'actors'.
export const PROMOTE = /jsonb_array_length\(COALESCE\(source_reference->'actors'/;
