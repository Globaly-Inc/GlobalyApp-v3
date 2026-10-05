/**
 * `requirePermission` is the only thing standing between an org-scoped token and a business's
 * data, and a token OUTLIVES the membership it was minted for. switch-account
 * (auth.service.ts) refuses to mint one for a suspended, contact-only or deleted agent; this
 * asserts the request-time guard re-checks all three, so suspending somebody takes effect now
 * rather than whenever their token happens to expire (Greptile P1).
 *
 * Fake wire: tests/institution-memory.harness.ts. No DB needed.
 * Run: node --import tsx tests/permission-guard.ts   (npm run test:permission-guard)
 */
export {};

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";

const { assert, finish, reset, find } = await import("./institution-memory.harness.js");
const { masterKnex } = await import("../src/core/db/master-pool.js");
const { requirePermission } = await import("../src/core/plugins/auth.plugin.js");

const AGENTS = /from "agents"/i;

/** Runs the guard against the fake wire and reports what it answered. */
async function run(agentRows: unknown[], permRows: unknown[] = []) {
  reset([
    [AGENTS, () => agentRows],
    [/from "role_permissions"/i, () => permRows],
  ]);
  let status = 200;
  let body: { error?: string; missing?: string[] } | undefined;
  const reply = { status: (c: number) => { status = c; return reply; }, send: (b: never) => { body = b; } };
  await requirePermission("business:write")(
    { db: masterKnex, auth: { sub: "7", orgId: "acme" } } as never,
    reply as never,
  );
  return { status, body };
}

console.log("\n1. the membership is re-read, not trusted from the token");
{
  await run([]);
  const sql = find(AGENTS);
  assert(/"account_status" = \$\d/.test(sql.text) && sql.values.includes(1),
    "a SUSPENDED agent is rejected — account_status is checked, not just deleted_at", sql.text);
  assert(/"is_contact_only" = \$\d/.test(sql.text),
    "and a contact-only row, which switch-account also refuses to mint a token for", sql.text);
  assert(/"deleted_at" is null/i.test(sql.text), "and a removed agent", sql.text);
  assert(sql.values.includes(7), "scoped to the token's own platform user", sql.values);
}

console.log("\n2. and the answer is a refusal, not a pass-through");
{
  const no = await run([]);
  assert(no.status === 403 && no.body?.error === "Not a member of this business",
    "no matching agent row = 403", no);

  const missing = await run([{ role_id: 3 }], []);
  assert(missing.status === 403 && missing.body?.missing?.[0] === "business:write",
    "an active agent whose role lacks the permission is still refused", missing);

  const ok = await run([{ role_id: 3 }], [{ perm_key: "business:write" }]);
  assert(ok.status === 200 && ok.body === undefined,
    "an active agent WITH the permission passes untouched", ok);
}

finish();
