/**
 * A tenant schema that has not had 20261005_001 applied yet must not 500 the portal home.
 *
 * Run: npm run test:embed-developers-missing-table
 *
 * Exists because the migration was written into database/migrations/institution/ only — the
 * business mirror was missing, so POST /api/v3/ai-chat/embed/ensure answered 500 for every
 * business owner with `relation "ai_embed_developers" does not exist`. The mirror is the real
 * fix; this pins the behaviour for a schema that is merely LAGGING, which no migration prevents.
 *
 * The read degrades to an empty list. Writes still throw: a send that was never recorded must
 * not be reported as recorded.
 */
process.env.DB_USERNAME ||= "x";
process.env.DB_PASSWORD ||= "x";
process.env.DB_NAME ||= "x";
process.env.DB_HOST ||= "127.0.0.1";
process.env.JWT_SECRET ||= "x";

import * as embedRepo from "../src/modules/ai-counsellor/repositories/embed.repository.js";

let passed = 0, failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.error(`  FAIL ${label}`); }
}

const pgError = (code: string, message: string) => Object.assign(new Error(message), { code });

/** Knex-shaped just far enough for these two queries: every builder step returns `this`, and
 *  awaiting the builder settles however the test asked. */
function fakeDb(settle: () => Promise<unknown>) {
  const builder: Record<string, unknown> = {};
  for (const step of ["where", "orderBy", "insert", "onConflict", "merge", "del"]) {
    builder[step] = () => builder;
  }
  builder.returning = () => settle();
  builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => settle().then(res, rej);
  const db = () => builder;
  (db as unknown as { fn: unknown; raw: unknown }).fn = { now: () => "now()" };
  (db as unknown as { raw: unknown }).raw = (s: string) => s;
  return db as unknown as Parameters<typeof embedRepo.listDevelopers>[0];
}

const missingTable = () => Promise.reject(pgError("42P01", 'relation "ai_embed_developers" does not exist'));

console.log("\n1. listDevelopers on a schema missing the table");
{
  const rows = await embedRepo.listDevelopers(fakeDb(missingTable), 1).catch((e) => e as Error);
  assert(Array.isArray(rows) && rows.length === 0, "returns an empty list instead of throwing");
}

console.log("\n2. any OTHER database error still surfaces");
{
  const result = await embedRepo
    .listDevelopers(fakeDb(() => Promise.reject(pgError("42703", 'column "email" does not exist'))), 1)
    .then(() => null, (e: Error) => e);
  assert(result instanceof Error, "an undefined COLUMN is a real bug and must not be swallowed");
}

console.log("\n3. rows pass through untouched when the table is there");
{
  const row = { id: 7, ai_embed_config_id: 1, email: "dev@x.com", last_sent_at: null, send_count: 0, created_at: new Date(), updated_at: new Date() };
  const rows = await embedRepo.listDevelopers(fakeDb(() => Promise.resolve([row])), 1);
  assert(rows.length === 1 && rows[0]!.email === "dev@x.com", "the happy path is unchanged");
}

console.log("\n4. recordSend does NOT swallow a missing table");
{
  const result = await embedRepo.recordSend(fakeDb(missingTable), 1, "dev@x.com").then(() => null, (e: Error) => e);
  assert(result instanceof Error, "a send that was not recorded must fail loudly, not report success");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
