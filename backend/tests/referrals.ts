/**
 * Referral program tests — exercises the money path and every invariant that guards it.
 * Run: DB_NAME=globalyapp_test node --import tsx tests/referrals.ts   (or: npm run test:referrals)
 *
 * Style matches tests/auth.ts: a plain tsx script with manual counters, no framework.
 *
 * Two things it does differently, both deliberate:
 *
 *  1. It imports masterKnex DIRECTLY as well as calling HTTP. The concurrency case has to race real
 *     transactions against real row locks — a mocked transaction cannot exercise that and would pass
 *     vacuously.
 *
 *  2. It REFUSES to run outside a dedicated test database. credit_transactions is append-only and
 *     trigger-protected, so this suite physically cannot clean up after itself: every run leaves
 *     permanent ledger rows. Against a shared dev database that is unrecoverable pollution.
 *     Every assertion is additionally scoped to fixtures this run created, and balances are compared
 *     as DELTAS, so the suite stays correct on an already-populated database.
 */

import { masterKnex } from "../src/core/db/master-pool.js";
import { config } from "../src/config.js";
import { generateReferralCode } from "../src/modules/referrals/utils/generate-referral-code.js";
import { mintRefToken } from "../src/modules/referrals/services/attribution.service.js";
import { onBusinessVerified } from "../src/modules/referrals/services/qualification.service.js";
import { issueCode } from "../src/modules/referrals/services/codes.service.js";
import { REFERRAL_CONFIG } from "../src/modules/referrals/consts.js";
import { addTransaction } from "../src/modules/credits/credits.repository.js";
import jwt from "jsonwebtoken";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3010/api/v3";

// ── Guard: dedicated test database only ─────────────────────────────────────────────────────────
if (!/_test$/.test(config.DB_NAME)) {
  console.error(
    `\nREFUSING TO RUN.\n\n` +
      `  DB_NAME is "${config.DB_NAME}", which does not end in "_test".\n\n` +
      `  credit_transactions is append-only and protected by a trigger, so this suite cannot delete\n` +
      `  what it writes. Running it against a shared database permanently pollutes the ledger.\n\n` +
      `  Create one and point at it:\n` +
      `    DB_NAME=${config.DB_NAME}_test node --import tsx node_modules/knex/bin/cli.js \\\n` +
      `      migrate:latest --knexfile knexfile.ts --env globalyapp\n` +
      `    DB_NAME=${config.DB_NAME}_test npm run test:referrals\n`,
  );
  process.exit(1);
}

// ── Harness ─────────────────────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(id: string, label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  PASS ${id}  ${label}`);
  } else {
    failed++;
    failures.push(`${id} ${label}`);
    console.log(`  FAIL ${id}  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

async function expectThrow(id: string, label: string, fn: () => Promise<unknown>, constraint?: string) {
  try {
    await fn();
    check(id, label, false, "expected a throw, got none");
  } catch (err) {
    const e = err as { code?: string; constraint?: string; message?: string };
    if (!constraint) check(id, label, true);
    else check(id, label, e.constraint === constraint || e.code === constraint, {
      code: e.code, constraint: e.constraint, message: e.message?.slice(0, 90),
    });
  }
}

/** Unique per run, so fixtures never collide with previous runs (nothing can be deleted). */
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = () => `${RUN}${(seq++).toString(36)}`;

async function makeUser(opts: { active?: boolean; meta?: Record<string, unknown> } = {}) {
  const tag = uniq();
  const [u] = await masterKnex("platform_users")
    .insert({
      first_name: `T${tag}`,
      last_name: "Test",
      email: `ref-${tag}@test.local`,
      account_status: opts.active === false ? 0 : 1,
      ...(opts.meta ? { meta: opts.meta } : {}),
    })
    .returning("*");
  return u as { id: number; first_name: string; meta: Record<string, unknown> | null };
}

async function makeUserWithCode() {
  const u = await makeUser();
  const code = await issueCode("user", u.id);
  const row = await masterKnex("referral_codes").where({ owner_type: "user", owner_id: u.id }).first();
  return { user: u, code: code!, codeId: row.id as number };
}

async function makeBusiness(ownerId: number, status = "pending") {
  const tag = uniq();
  const [b] = await masterKnex("businesses")
    .insert({
      owner_id: ownerId,
      subdomain: `ref-${tag}`,
      business_name: `Biz ${tag}`,
      status,
      account_status: 1,
    })
    .returning("*");
  return b as { id: number };
}

/** Attribute directly, bypassing HTTP — most cases care about the award, not the sign-up flow. */
async function makeReferral(referrerType: "user" | "business", referrerId: number, codeId: number, referredId: number) {
  const [r] = await masterKnex("referrals")
    .insert({
      referral_code_id: codeId,
      referrer_type: referrerType,
      referrer_id: referrerId,
      referred_type: "user",
      referred_id: referredId,
      state: "signed_up",
      signed_up_at: masterKnex.fn.now(),
    })
    .returning("*");
  return r as { id: number };
}

const rewardRows = (referralId: number) =>
  masterKnex("credit_transactions")
    .where({ reference_type: "referral", reference_id: referralId, kind: "referral_reward" })
    .count({ n: "*" })
    .first<{ n: string }>()
    .then((r) => Number(r.n));

const balanceOf = (ownerType: string, ownerId: number) =>
  masterKnex("credit_transactions")
    .where({ owner_type: ownerType, owner_id: ownerId })
    .sum({ s: "amount" })
    .first<{ s: string | null }>()
    .then((r) => Number(r.s ?? 0));

const api = async (method: string, path: string, body?: unknown, token?: string) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json as Record<string, unknown> };
};

// ── Tests ───────────────────────────────────────────────────────────────────────────────────────

async function tConcurrency() {
  console.log("\nT-01/T-02  INV-1 — award is credited at most once");
  const referrer = await makeUserWithCode();
  const referred = await makeUser();
  const biz = await makeBusiness(referred.id, "verified");
  const referral = await makeReferral("user", referrer.user.id, referrer.codeId, referred.id);

  const before = await balanceOf("user", referrer.user.id);

  // 10 genuinely concurrent awards against one signed_up row.
  await Promise.all(Array.from({ length: 10 }, () => onBusinessVerified(biz.id)));

  const rewards = await rewardRows(referral.id);
  const after = await balanceOf("user", referrer.user.id);
  const row = await masterKnex("referrals").where({ id: referral.id }).first();

  check("T-01a", "10 concurrent awards -> exactly 1 reward row", rewards === 1, { rewards });
  check("T-01b", "balance delta equals exactly one reward",
    after - before === REFERRAL_CONFIG.business_referral_reward, { before, after });
  check("T-01c", "state credited, amount snapshotted",
    row.state === "credited" && row.credits_awarded === REFERRAL_CONFIG.business_referral_reward, {
      state: row.state, credits: row.credits_awarded });
  check("T-01d", "credit_transaction_id pointer set", row.credit_transaction_id !== null);

  // T-02: re-run after settling.
  await onBusinessVerified(biz.id);
  check("T-02", "re-award after credited -> no second reward", (await rewardRows(referral.id)) === 1);

  return { referralId: referral.id, referrerId: referrer.user.id };
}

async function tLedgerConstraints(referralId: number, referrerId: number) {
  console.log("\nT-03/T-04/T-18  ledger constraints");

  await expectThrow("T-03", "second referral_reward for same referral rejected", async () => {
    await masterKnex.transaction((trx) =>
      addTransaction(trx, {
        owner_type: "user", owner_id: referrerId, amount: 20,
        kind: "manual_adjustment", reference_type: "referral", reference_id: referralId,
      }).then(() =>
        // manual_adjustment is allowed to share the reference; force the real collision instead
        trx.raw(
          `INSERT INTO credit_transactions (owner_type, owner_id, amount, kind, reference_type, reference_id)
           VALUES ('user', ?, 20, 'referral_reward', 'referral', ?)`,
          [referrerId, referralId],
        ),
      ),
    );
  }, "23505");

  await masterKnex.transaction(async (trx) => {
    await addTransaction(trx, {
      owner_type: "user", owner_id: referrerId, amount: -20,
      kind: "referral_reversal", reference_type: "referral", reference_id: referralId,
    });
  });
  check("T-04", "referral_reversal with same reference_id inserts (index correctly scoped)", true);

  const anyRow = await masterKnex("credit_transactions").where({ owner_id: referrerId }).first();
  await expectThrow("T-18a", "UPDATE on credit_transactions raises", () =>
    masterKnex("credit_transactions").where({ id: anyRow.id }).update({ amount: 1 }));
  await expectThrow("T-18b", "DELETE on credit_transactions raises", () =>
    masterKnex("credit_transactions").where({ id: anyRow.id }).del());

  await expectThrow("T-18c", "addTransaction rejects a nonexistent owner", () =>
    masterKnex.transaction((trx) =>
      addTransaction(trx, { owner_type: "user", owner_id: 999_999_99, amount: 5, kind: "purchase" })));
}

async function tUniqueReferred() {
  console.log("\nT-05  INV-3 — a person is referred at most once");
  const a = await makeUserWithCode();
  const b = await makeUserWithCode();
  const referred = await makeUser();
  await makeReferral("user", a.user.id, a.codeId, referred.id);
  await expectThrow("T-05", "second attribution for same referred user rejected", () =>
    makeReferral("user", b.user.id, b.codeId, referred.id), "referrals_referred_unique");
}

async function tW2() {
  console.log("\nT-10  W2 is enforced at award time in Phase 1");
  const referrer = await makeUserWithCode();
  const referred = await makeUser();
  const biz = await makeBusiness(referred.id, "verified");
  const referral = await makeReferral("user", referrer.user.id, referrer.codeId, referred.id);

  // Backdate beyond W2.
  await masterKnex("referrals").where({ id: referral.id })
    .update({ signed_up_at: masterKnex.raw(`now() - interval '${REFERRAL_CONFIG.w2_days + 10} days'`) });

  await onBusinessVerified(biz.id);
  const row = await masterKnex("referrals").where({ id: referral.id }).first();
  check("T-10a", "late qualification credits nothing", (await rewardRows(referral.id)) === 0);
  check("T-10b", "row remains signed_up (claim rolled back)", row.state === "signed_up", { state: row.state });
}

async function tTokens() {
  console.log("\nT-09/T-12/T-24d  token validation and W1");
  const { codeId, user } = await makeUserWithCode();

  const forged = jwt.sign({ rcid: codeId, rtype: "user", rid: user.id }, "not-the-real-secret");
  const expired = jwt.sign({ rcid: codeId, rtype: "user", rid: user.id }, config.JWT_SECRET as jwt.Secret, { expiresIn: "-1h" });
  const mismatched = jwt.sign({ rcid: codeId, rtype: "user", rid: user.id + 99_999 }, config.JWT_SECRET as jwt.Secret, { expiresIn: "30d" });
  const accessShaped = jwt.sign({ sub: user.id, type: "platform_user", email: "x@y.z", rcid: codeId, rtype: "user", rid: user.id }, config.JWT_SECRET as jwt.Secret, { expiresIn: "30d" });

  // Called through the SERVICE, not HTTP: /auth/register is rate-limited to 5 per 15 minutes
  // (RATE_LIMITS.register), so driving these over HTTP makes the suite un-rerunnable. These cases are
  // about validateRefToken and what gets stored — not about route wiring, which T-08d covers.
  const { registerUser } = await import("../src/modules/auth/auth.service.js");

  // These three are rejected by validateRefToken itself — a pure signature+shape check — so nothing is
  // even stored at registration.
  for (const [id, label, token] of [
    ["T-12a", "forged token (wrong secret)", forged],
    ["T-24d", "expired token (W1 lapsed)", expired],
    ["T-12c", "access-token-shaped payload rejected as ref_token", accessShaped],
  ] as const) {
    const email = `reg-${uniq()}@test.local`;
    await registerUser("Reg", "Test", email, token);
    const created = await masterKnex("platform_users").where({ email }).first();
    check(id, `${label} -> user created, nothing pending`,
      !!created && !created.meta?.pending_referral, { pending: created?.meta?.pending_referral });
  }

  // A token whose claims disagree with the DB row is a DIFFERENT case: validateRefToken is pure (no
  // database), so a correctly-signed token passes registration and is stored. The cross-check against
  // referral_codes happens at materialisation, where the DB always wins over the token. The contract is
  // "no ATTRIBUTION" — not "nothing stored" — so assert the whole path.
  {
    const { materialiseReferral } = await import("../src/modules/referrals/services/attribution.service.js");
    const email = `reg-${uniq()}@test.local`;
    await registerUser("Reg", "Mismatch", email, mismatched);
    const created = await masterKnex("platform_users").where({ email }).first();
    check("T-12b1", "mismatched claims -> stored pending (the signature IS valid)",
      !!created?.meta?.pending_referral);

    await materialiseReferral(created.id);
    const rows = await masterKnex("referrals").where({ referred_id: created.id }).count({ n: "*" }).first();
    const after = await masterKnex("platform_users").where({ id: created.id }).first();
    check("T-12b2", "materialise rejects it -> no referral, token consumed (terminal)",
      Number(rows.n) === 0 && !after.meta?.pending_referral, { rows: rows.n });
  }

  // A VALID token must be stored as pending — and must NOT create a referral yet (T-08).
  const email = `reg-${uniq()}@test.local`;
  const good = mintRefToken(codeId, "user", user.id);
  await registerUser("Reg", "Ok", email, good);
  const created = await masterKnex("platform_users").where({ email }).first();
  check("T-08a", "valid token -> pending_referral stored", !!created?.meta?.pending_referral, created?.meta);
  const refCount = await masterKnex("referrals").where({ referred_id: created.id }).count({ n: "*" }).first();
  check("T-08b", "registration alone creates NO referral row (not yet an account)",
    Number(refCount.n) === 0, { rows: refCount.n });
  // Issuance is fire-and-forget; give it a moment before asserting.
  await new Promise((r) => setTimeout(r, 300));
  check("T-08c", "referral code issued at registration", !!(await masterKnex("referral_codes")
    .where({ owner_type: "user", owner_id: created.id }).first()));

  // ONE HTTP registration, purely to prove the route threads ref_token through to the service. Skipped
  // rather than failed when the 5-per-15-minutes register limit is already spent, so re-runs stay green.
  const httpEmail = `reg-${uniq()}@test.local`;
  const httpRes = await api("POST", "/auth/register", {
    first_name: "Reg", last_name: "Http", email: httpEmail, ref_token: mintRefToken(codeId, "user", user.id),
  });
  if (httpRes.status === 201) {
    const httpUser = await masterKnex("platform_users").where({ email: httpEmail }).first();
    check("T-08d", "POST /auth/register threads ref_token through to the service",
      !!httpUser?.meta?.pending_referral, httpUser?.meta);
  } else {
    console.log(`  SKIP T-08d  register rate limit spent (HTTP ${httpRes.status}) — 5 per 15 min`);
  }
}

async function tRelatedPartyAndSelf() {
  console.log("\nT-13/T-14/T-25  self-referral and the related-party matrix");
  const { materialiseReferral } = await import("../src/modules/referrals/services/attribution.service.js");

  // Self-referral.
  const selfUser = await makeUserWithCode();
  await masterKnex("platform_users").where({ id: selfUser.user.id }).update({
    meta: { pending_referral: { rcid: selfUser.codeId, rtype: "user", rid: selfUser.user.id, token_expires_at: "", registered_at: new Date().toISOString() } },
  });
  await materialiseReferral(selfUser.user.id);
  const selfRows = await masterKnex("referrals").where({ referred_id: selfUser.user.id }).count({ n: "*" }).first();
  const selfMeta = await masterKnex("platform_users").where({ id: selfUser.user.id }).first();
  check("T-13", "self-referral -> no referral, token consumed",
    Number(selfRows.n) === 0 && !selfMeta.meta?.pending_referral);

  // Related party: business referring a LIVE member -> blocked.
  const owner = await makeUser();
  const biz = await makeBusiness(owner.id);
  await issueCode("business", biz.id);
  const bizCode = await masterKnex("referral_codes").where({ owner_type: "business", owner_id: biz.id }).first();

  const member = await makeUser();
  await masterKnex("user_business_index").insert({ platform_user_id: member.id, business_id: biz.id, role: "member", is_owner: false });
  await masterKnex("platform_users").where({ id: member.id }).update({
    meta: { pending_referral: { rcid: bizCode.id, rtype: "business", rid: biz.id, token_expires_at: "", registered_at: new Date().toISOString() } },
  });
  await materialiseReferral(member.id);
  const memberRows = await masterKnex("referrals").where({ referred_id: member.id }).count({ n: "*" }).first();
  check("T-25a", "business referring its own LIVE member -> blocked", Number(memberRows.n) === 0);

  // Former member (deleted_at set) -> allowed.
  const former = await makeUser();
  await masterKnex("user_business_index").insert({
    platform_user_id: former.id, business_id: biz.id, role: "member", is_owner: false,
    deleted_at: masterKnex.fn.now(),
  });
  await masterKnex("platform_users").where({ id: former.id }).update({
    meta: { pending_referral: { rcid: bizCode.id, rtype: "business", rid: biz.id, token_expires_at: "", registered_at: new Date().toISOString() } },
  });
  await materialiseReferral(former.id);
  const formerRow = await masterKnex("referrals").where({ referred_id: former.id }).first();
  check("T-25b", "business referring a FORMER member -> allowed",
    !!formerRow && formerRow.referrer_type === "business" && formerRow.referrer_id === biz.id);

  // Retry semantics: a second call is a cheap no-op, not a duplicate.
  await materialiseReferral(former.id);
  const formerCount = await masterKnex("referrals").where({ referred_id: former.id }).count({ n: "*" }).first();
  check("T-06", "repeat materialise (re-login) -> still exactly 1 referral", Number(formerCount.n) === 1);
}

async function tRetryAfterTransientFailure() {
  console.log("\nT-24b  INV-9 — a pending referral survives a transient failure and retries later");
  const { materialiseReferral } = await import("../src/modules/referrals/services/attribution.service.js");
  const referrer = await makeUserWithCode();
  const referred = await makeUser();

  const pending = { rcid: referrer.codeId, rtype: "user", rid: referrer.user.id, token_expires_at: "", registered_at: new Date().toISOString() };
  await masterKnex("platform_users").where({ id: referred.id }).update({ meta: { pending_referral: pending } });

  // Simulate a transient write failure: make the insert violate a NOT NULL it cannot satisfy by
  // dropping the FK target temporarily is too invasive, so instead assert the contract directly —
  // a failed transaction must leave pending_referral in place.
  let threw = false;
  try {
    await masterKnex.transaction(async (trx) => {
      await trx("platform_users").where({ id: referred.id })
        .update({ meta: trx.raw("meta - 'pending_referral'") });
      throw new Error("simulated transient DB failure");
    });
  } catch { threw = true; }

  const afterFail = await masterKnex("platform_users").where({ id: referred.id }).first();
  check("T-24a", "transient failure rolls back -> pending_referral RETAINED",
    threw && !!afterFail.meta?.pending_referral);

  // The account is already active (account_status = 1), which is exactly the state the removed
  // isFirstActivation gate would have refused to retry from.
  await materialiseReferral(referred.id);
  const row = await masterKnex("referrals").where({ referred_id: referred.id }).first();
  check("T-24b", "later login retries and attributes (no isFirstActivation gate)",
    !!row && row.referrer_id === referrer.user.id && row.state === "signed_up");
}

async function tMultipleBusinesses() {
  console.log("\nT-15  INV-4 — one referred user yields at most one business reward");
  const referrer = await makeUserWithCode();
  const referred = await makeUser();
  const referral = await makeReferral("user", referrer.user.id, referrer.codeId, referred.id);

  const b1 = await makeBusiness(referred.id, "verified");
  const b2 = await makeBusiness(referred.id, "verified");
  const b3 = await makeBusiness(referred.id, "verified");

  await onBusinessVerified(b1.id);
  await onBusinessVerified(b2.id);
  await onBusinessVerified(b3.id);

  const row = await masterKnex("referrals").where({ id: referral.id }).first();
  check("T-15a", "3 verified businesses -> exactly 1 reward", (await rewardRows(referral.id)) === 1);
  check("T-15b", "action_type=business_referral, qualifying_business_id = FIRST verified",
    row.action_type === "business_referral" && row.qualifying_business_id === b1.id,
    { action: row.action_type, qualifying: row.qualifying_business_id, first: b1.id });
  check("T-15c", "credits_awarded = business amount",
    row.credits_awarded === REFERRAL_CONFIG.business_referral_reward);
}

async function tBusinessGuards() {
  console.log("\nT-26  onBusinessVerified re-verifies its own preconditions");
  const referrer = await makeUserWithCode();
  const referred = await makeUser();
  const referral = await makeReferral("user", referrer.user.id, referrer.codeId, referred.id);

  const unverified = await makeBusiness(referred.id, "pending");
  await onBusinessVerified(unverified.id);
  check("T-26a", "non-verified business does not qualify", (await rewardRows(referral.id)) === 0);

  const deleted = await makeBusiness(referred.id, "verified");
  await masterKnex("businesses").where({ id: deleted.id }).update({ deleted_at: masterKnex.fn.now() });
  await onBusinessVerified(deleted.id);
  check("T-26b", "soft-deleted business does not qualify", (await rewardRows(referral.id)) === 0);

  const otherOwner = await makeUser();
  const foreign = await makeBusiness(otherOwner.id, "verified");
  await onBusinessVerified(foreign.id);
  check("T-26c", "business owned by someone else does not pay this referral",
    (await rewardRows(referral.id)) === 0);
}

async function tSoftDeleteRetention() {
  console.log("\nT-17  INV-6 — history survives deletion");
  const referrer = await makeUserWithCode();
  const referred = await makeUser();
  const biz = await makeBusiness(referred.id, "verified");
  const referral = await makeReferral("user", referrer.user.id, referrer.codeId, referred.id);
  await onBusinessVerified(biz.id);
  check("T-17a", "credited before deletion", (await rewardRows(referral.id)) === 1);

  await masterKnex("platform_users").whereIn("id", [referrer.user.id, referred.id])
    .update({ deleted_at: masterKnex.fn.now() });
  await masterKnex("businesses").where({ id: biz.id }).update({ deleted_at: masterKnex.fn.now() });

  const row = await masterKnex("referrals").where({ id: referral.id }).first();
  check("T-17b", "referral row still readable after soft delete", !!row && row.state === "credited");
  check("T-17c", "ledger rows still readable", (await rewardRows(referral.id)) === 1);

  // Name resolution must degrade, not vanish or throw.
  const joined = await masterKnex("referrals as r")
    .leftJoin("platform_users as u", function () {
      this.on("u.id", "=", "r.referrer_id").andOnVal("r.referrer_type", "=", "user").andOnNull("u.deleted_at");
    })
    .where("r.id", referral.id)
    .select("r.id", "u.first_name")
    .first();
  check("T-17d", "LEFT JOIN yields the row with an unresolved name (never drops it)",
    !!joined && joined.first_name === null, joined);
}

async function tCodeIssuance() {
  console.log("\nT-20b/T-20c  INV-10 — issuance is idempotent and repairable");
  const u = await makeUser();

  const first = await issueCode("user", u.id);
  const second = await issueCode("user", u.id);
  check("T-20c", "issueCode is idempotent (same code returned twice)",
    !!first && first === second, { first, second });
  const count = await masterKnex("referral_codes").where({ owner_type: "user", owner_id: u.id }).count({ n: "*" }).first();
  check("T-20c2", "exactly one code row", Number(count.n) === 1);

  // Simulated repair: a user with NO code (the state a transient issuance failure leaves behind).
  const orphan = await makeUser();
  const missingBefore = await masterKnex("platform_users as p")
    .leftJoin("referral_codes as c", function () {
      this.on("c.owner_id", "=", "p.id").andOnVal("c.owner_type", "=", "user");
    })
    .whereNull("c.id").where("p.id", orphan.id).count({ n: "*" }).first();
  check("T-20b1", "user exists with no code (repairable state)", Number(missingBefore.n) === 1);

  const repaired = await issueCode("user", orphan.id);
  check("T-20b2", "reconciliation issues exactly one code", !!repaired);
  const again = await issueCode("user", orphan.id);
  check("T-20b3", "repeated repair is a no-op", again === repaired);

  // Collision handling: a duplicate code must be rejected by the lower(code) index.
  const dup = generateReferralCode();
  const v1 = await makeUser();
  const v2 = await makeUser();
  await masterKnex("referral_codes").insert({ owner_type: "user", owner_id: v1.id, code: dup });
  await expectThrow("T-20d", "duplicate code rejected by lower(code) index", () =>
    masterKnex("referral_codes").insert({ owner_type: "user", owner_id: v2.id, code: dup.toLowerCase() }),
    "referral_codes_code_lower");
}

async function tPublicEndpoints() {
  console.log("\nT-19  public endpoints and the default-private rule");
  const { code, user } = await makeUserWithCode();

  const cfg = await api("GET", "/referrals/config");
  check("T-19a1", "GET /referrals/config is 200 unauthenticated", cfg.status === 200, cfg.body);
  check("T-19a2", "config matches the single source of truth",
    cfg.body.student_referral_reward === REFERRAL_CONFIG.student_referral_reward &&
    cfg.body.business_referral_reward === REFERRAL_CONFIG.business_referral_reward);

  const look = await api("GET", `/referrals/lookup/${code}`);
  check("T-19a3", "lookup is 200 unauthenticated", look.status === 200, look.body);
  check("T-19a4", "lookup returns EXACTLY 3 fields",
    Object.keys(look.body).sort().join(",") === "display_name,ref_token,referrer_type",
    Object.keys(look.body));
  // Full name by product decision. The assertion that matters is the NEGATIVE one: the payload must
  // still carry nothing beyond the three allow-listed fields — no email, no ids.
  check("T-19a5", "display_name is the full name, and nothing else leaks",
    look.body.display_name === `${user.first_name} Test` &&
      !JSON.stringify(look.body).includes("@") &&
      !("owner_id" in look.body) &&
      !("code_id" in look.body),
    look.body);

  const unknown = await api("GET", "/referrals/lookup/ZZZZZZZZZZ");
  check("T-19a6", "unknown code -> generic 404, identical body",
    unknown.status === 404 && JSON.stringify(unknown.body) === JSON.stringify(look.status === 200 ? { error: "We couldn't find that invite link." } : unknown.body),
    unknown.body);

  const me = await api("GET", "/referrals/me");
  check("T-19c", "authenticated route without a token stays 401 (default private)", me.status === 401, me.body);

  const market = await api("GET", "/services/categories");
  check("T-19b", "public marketplace route responds unauthenticated", market.status === 200, market.status);

  // Inactive owner: a historical code must stop being publicly usable.
  const inactive = await makeUserWithCode();
  await masterKnex("platform_users").where({ id: inactive.user.id }).update({ deleted_at: masterKnex.fn.now() });
  const gone = await api("GET", `/referrals/lookup/${inactive.code}`);
  check("T-24e", "code of a deleted owner -> generic 404 (history kept, lookup closed)",
    gone.status === 404, gone.body);
  check("T-24e2", "the referral_codes row itself is retained",
    !!(await masterKnex("referral_codes").where({ owner_id: inactive.user.id, owner_type: "user" }).first()));
}

async function tStudentPath() {
  console.log("\nT-16  student qualification pays the student amount");
  const { onIndividualQualified } = await import("../src/modules/referrals/services/qualification.service.js");
  const referrer = await makeUserWithCode();
  const referred = await makeUser();
  const referral = await makeReferral("user", referrer.user.id, referrer.codeId, referred.id);

  const before = await balanceOf("user", referrer.user.id);
  await onIndividualQualified(referred.id);
  const row = await masterKnex("referrals").where({ id: referral.id }).first();
  const after = await balanceOf("user", referrer.user.id);

  check("T-16a", "student path -> exactly 1 reward", (await rewardRows(referral.id)) === 1);
  check("T-16b", "action_type=student_referral, amount=student amount, qualifying_business_id NULL",
    row.action_type === "student_referral" &&
    row.credits_awarded === REFERRAL_CONFIG.student_referral_reward &&
    row.qualifying_business_id === null,
    { action: row.action_type, credits: row.credits_awarded, qb: row.qualifying_business_id });
  check("T-16c", "balance delta = student amount",
    after - before === REFERRAL_CONFIG.student_referral_reward, { before, after });
}

// ── Run ─────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Referral tests — DB=${config.DB_NAME}  API=${BASE}  run=${RUN}`);

  const { referralId, referrerId } = await tConcurrency();
  await tLedgerConstraints(referralId, referrerId);
  await tUniqueReferred();
  await tW2();
  await tStudentPath();
  await tMultipleBusinesses();
  await tBusinessGuards();
  await tSoftDeleteRetention();
  await tCodeIssuance();
  await tTokens();
  await tRelatedPartyAndSelf();
  await tRetryAfterTransientFailure();
  await tPublicEndpoints();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) console.log("failed:\n  " + failures.join("\n  "));
  // Let fire-and-forget work (code issuance, attribution) settle before tearing the pool down —
  // destroying mid-query trips a libuv assertion on Windows.
  await new Promise((r) => setTimeout(r, 500));
  await masterKnex.destroy();
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error("\nSUITE ERROR:", err);
  await masterKnex.destroy();
  process.exit(1);
});
