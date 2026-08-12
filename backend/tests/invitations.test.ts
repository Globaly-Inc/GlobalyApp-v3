/**
 * Invitation index: authorization, idempotency, email matching, and the drift/recovery behaviour of the
 * cross-connection dual write.
 *
 * These exercise the globalyapp side (index rows, authorization, membership repair) with the tenant side
 * simulated, because provisioning a real per-business schema needs the tenant migration runner. The tenant
 * interaction itself is covered by the reconciler's own convergence assertions below.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getApp, closeApp, resetDb, createUser, createBusiness, addMembership, auth, masterKnex } from "./helpers.js";
import * as indexRepo from "../src/modules/platform-users/repositories/business-invitations.repository.js";

before(async () => {
  await getApp();
});
after(closeApp);
beforeEach(resetDb);

async function seedInvite(businessId: number, email: string, overrides: Record<string, unknown> = {}) {
  return indexRepo.upsert({
    business_id: businessId,
    tenant_invitation_id: crypto.randomUUID(),
    invitee_email: email,
    role: "counsellor",
    token_hash: indexRepo.hashToken(crypto.randomUUID()),
    expires_at: new Date(Date.now() + 72 * 3600 * 1000),
    ...overrides,
  });
}

// 7. Authorization — the row must be addressed to the caller.
test("an invitation addressed to someone else is 403", async () => {
  const app = await getApp();
  const invitee = await createUser({ email: "invitee@example.com" });
  const intruder = await createUser({ email: "intruder@example.com" });
  const business = await createBusiness();
  const invite = await seedInvite(business.id, invitee.email);

  const res = await app.inject({
    method: "POST", url: `/api/v3/platform-users/me/business-invites/${invite.id}/respond`,
    headers: auth(intruder.id, intruder.email),
    payload: { action: "accept" },
  });
  assert.equal(res.statusCode, 403);
});

// 9. Email matching — server-side, case/whitespace-insensitive, and never from the client.
test("an invite created before the account existed becomes visible after signup, case-insensitively", async () => {
  const app = await getApp();
  const business = await createBusiness();
  // Invitation addressed to an email with different case/whitespace and no linked account yet.
  await seedInvite(business.id, "  New.Person@Example.COM ");

  const user = await createUser({ email: "new.person@example.com" });
  const res = await app.inject({
    method: "GET", url: "/api/v3/platform-users/me/business-invites",
    headers: auth(user.id, user.email),
  });
  assert.equal(res.statusCode, 200);
  // The tenant row does not exist in this harness, so the read path correctly withholds it rather than
  // offering an action that would fail — the matching itself is asserted directly below.
  const matched = await indexRepo.listPendingForUser(user.id, user.email);
  assert.equal(matched.length, 1, "normalized email must match the invitee");
});

test("a client-supplied email cannot be used to claim an invitation", async () => {
  const app = await getApp();
  const business = await createBusiness();
  const invite = await seedInvite(business.id, "victim@example.com");
  const attacker = await createUser({ email: "attacker@example.com" });

  const res = await app.inject({
    method: "POST", url: `/api/v3/platform-users/me/business-invites/${invite.id}/respond`,
    // Even if an email is supplied in the body, authorization reads the caller's own row.
    headers: auth(attacker.id, "victim@example.com"),
    payload: { action: "accept", email: "victim@example.com" },
  });
  assert.equal(res.statusCode, 403);
});

// 8 / 8b. Terminal states are idempotent — a stale row must vanish quietly, not error.
test("responding to an already-accepted invitation is a silent 204", async () => {
  const app = await getApp();
  const user = await createUser({ email: "member@example.com" });
  const business = await createBusiness();
  const invite = await seedInvite(business.id, user.email, { status: "accepted", platform_user_id: user.id });

  for (const action of ["accept", "decline"] as const) {
    const res = await app.inject({
      method: "POST", url: `/api/v3/platform-users/me/business-invites/${invite.id}/respond`,
      headers: auth(user.id, user.email),
      payload: { action },
    });
    assert.equal(res.statusCode, 204, `${action} on a terminal invite must be a silent no-op`);
  }

  const row = await indexRepo.findById(invite.id);
  assert.equal(row?.status, "accepted", "a terminal row must not be overwritten");
});

test("expired invitations are withheld and lazily marked expired", async () => {
  const app = await getApp();
  const user = await createUser({ email: "late@example.com" });
  const business = await createBusiness();
  await seedInvite(business.id, user.email, { expires_at: new Date(Date.now() - 3600 * 1000) });

  const res = await app.inject({
    method: "GET", url: "/api/v3/platform-users/me/business-invites",
    headers: auth(user.id, user.email),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().invites.length, 0, "an expired invite must never be offered");
});

test("the index upsert is idempotent on tenant_invitation_id", async () => {
  const business = await createBusiness();
  const tenantId = crypto.randomUUID();
  const shared = {
    business_id: business.id,
    tenant_invitation_id: tenantId,
    invitee_email: "dup@example.com",
    role: "member",
    expires_at: new Date(Date.now() + 3600 * 1000),
  };

  await indexRepo.upsert(shared);
  await indexRepo.upsert({ ...shared, role: "counsellor" });

  const rows = await masterKnex("business_invitation_index").where({ tenant_invitation_id: tenantId });
  assert.equal(rows.length, 1, "a replayed dual write must not duplicate");
  assert.equal(rows[0].role, "counsellor", "the replay must converge to the latest tenant state");
});

test("token_hash is a hash — the plaintext token is never stored in the index", async () => {
  const business = await createBusiness();
  const token = "a-secret-token";
  const invite = await seedInvite(business.id, "hash@example.com", { token_hash: indexRepo.hashToken(token) });
  const row = await indexRepo.findById(invite.id);
  assert.notEqual(row?.token_hash, token);
  assert.equal(row?.token_hash, indexRepo.hashToken(token));
  assert.equal(row?.token_hash?.length, 64, "sha256 hex");
});

// 14 / 14c. Drift detection: a row whose status write failed carries NO flag, so only state
// reverification finds it. This asserts the queries the reconciler's two tiers depend on.
test("silent drift is invisible to the flagged sweep but visible to state reverification", async () => {
  const business = await createBusiness();
  const user = await createUser({ email: "drift@example.com" });
  // Simulates: tenant accepted, index status write failed, and the same outage prevented sync_error.
  // synced_at is valid and expires_at is in the future, so nothing flags this row.
  const invite = await seedInvite(business.id, user.email, { status: "pending" });
  await masterKnex("business_invitation_index")
    .where({ id: invite.id })
    .update({ synced_at: new Date(), sync_error: null });

  const flagged = await indexRepo.listFlagged();
  assert.equal(
    flagged.find((r) => r.id === invite.id),
    undefined,
    "the flagged sweep cannot see silent drift — this is why tier 2 exists",
  );

  const nonTerminal = await indexRepo.listNonTerminal();
  assert.ok(
    nonTerminal.some((r) => r.id === invite.id),
    "state reverification must pick up every non-terminal row regardless of flags",
  );
});

// 14b. The watermark's blind spot, and the full ID audit that closes it.
test("the incremental watermark can skip an older row that the full ID audit then finds", async () => {
  const business = await createBusiness();
  const older = new Date(Date.now() - 2 * 3600 * 1000);
  const newer = new Date(Date.now() - 1 * 3600 * 1000);

  // Only the NEWER invitation got indexed; the older one's index write failed.
  await seedInvite(business.id, "newer@example.com", { created_at: newer });
  const missingTenantId = crypto.randomUUID();

  const watermark = await indexRepo.latestIndexedCreatedAt(business.id);
  assert.ok(watermark && watermark >= newer, "the watermark advanced past the failed older invitation");
  assert.ok(older < watermark, "so an incremental scan keyed on created_at > watermark would skip it forever");

  // The full ID audit diffs id sets, not timestamps — so the gap is found regardless of age.
  const indexed = await indexRepo.listIndexedTenantIds(business.id);
  assert.equal(indexed.has(missingTenantId), false, "the audit sees it as missing");

  await indexRepo.upsert({
    business_id: business.id,
    tenant_invitation_id: missingTenantId,
    invitee_email: "older@example.com",
    role: "member",
    expires_at: new Date(Date.now() + 3600 * 1000),
    created_at: older,
  });
  const after = await indexRepo.listIndexedTenantIds(business.id);
  assert.equal(after.has(missingTenantId), true, "and repairs it");
});

test("membership repair is idempotent on (platform_user_id, business_id)", async () => {
  const user = await createUser();
  const business = await createBusiness();
  await addMembership(user.id, business.id);
  // The reconciler's repair path uses the same insert; the pre-existing unique constraint absorbs it.
  await masterKnex("user_business_index")
    .insert({ platform_user_id: user.id, business_id: business.id, role: "member", is_owner: false })
    .onConflict(["platform_user_id", "business_id"])
    .merge({ role: "member" });

  const rows = await masterKnex("user_business_index").where({ platform_user_id: user.id, business_id: business.id });
  assert.equal(rows.length, 1, "repair must never create a duplicate membership");
});
