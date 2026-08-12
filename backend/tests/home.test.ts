import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getApp, closeApp, resetDb, createUser, createProfile, createBusiness, addMembership, auth, masterKnex,
} from "./helpers.js";
import * as membershipRepo from "../src/modules/platform-users/repositories/memberships.repository.js";
import * as personalHome from "../src/modules/personal-home/services/personal-home.service.js";
import * as favoritesRepo from "../src/modules/favorites/repositories/favorites.repository.js";

before(async () => {
  await getApp();
});
after(closeApp);
beforeEach(resetDb);

// 10. Position confirmation, including a change AFTER an earlier confirmation.
test("a position is confirmed once, then reappears as 'changed' when it moves", async () => {
  const app = await getApp();
  const user = await createUser();
  await createProfile(user.id);
  const business = await createBusiness();
  const membership = await addMembership(user.id, business.id, { position: "Counsellor" });

  // First time: kind = "new".
  let updates = await membershipRepo.listPositionUpdates(user.id);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].kind, "new");
  assert.equal(updates[0].previous_position, null);

  const confirmed = await app.inject({
    method: "POST", url: `/api/v3/platform-users/me/position-updates/${membership.id}/confirm`,
    headers: auth(user.id, user.email),
  });
  assert.equal(confirmed.statusCode, 204);

  const experiences = await masterKnex("platform_user_work_experiences").where({ user_id: user.id });
  assert.equal(experiences.length, 1);
  assert.equal(experiences[0].job_title, "Counsellor");
  assert.equal(experiences[0].confirmed_position, "Counsellor");
  assert.equal(experiences[0].source_membership_id, membership.id);

  // Confirmed → nothing pending.
  updates = await membershipRepo.listPositionUpdates(user.id);
  assert.equal(updates.length, 0);

  // The position changes later. This is the case a first-time-only check would miss entirely.
  await masterKnex("user_business_index").where({ id: membership.id }).update({ position: "Senior Counsellor" });
  updates = await membershipRepo.listPositionUpdates(user.id);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].kind, "changed");
  assert.equal(updates[0].previous_position, "Counsellor");
  assert.equal(updates[0].position, "Senior Counsellor");

  // Re-confirming updates the SAME row rather than adding a second work-experience entry.
  await app.inject({
    method: "POST", url: `/api/v3/platform-users/me/position-updates/${membership.id}/confirm`,
    headers: auth(user.id, user.email),
  });
  const after = await masterKnex("platform_user_work_experiences").where({ user_id: user.id });
  assert.equal(after.length, 1, "no duplicate work-experience row");
  assert.equal(after[0].job_title, "Senior Counsellor");
  assert.equal(after[0].confirmed_position, "Senior Counsellor");
  assert.equal(
    new Date(after[0].start_date ?? 0).toISOString().slice(0, 10),
    new Date(experiences[0].start_date ?? 0).toISOString().slice(0, 10),
    "the original start date survives a retitle",
  );
});

test("confirming twice with no change is a no-op", async () => {
  const app = await getApp();
  const user = await createUser();
  const business = await createBusiness();
  const membership = await addMembership(user.id, business.id, { position: "Adviser" });
  const url = `/api/v3/platform-users/me/position-updates/${membership.id}/confirm`;

  await app.inject({ method: "POST", url, headers: auth(user.id, user.email) });
  const second = await app.inject({ method: "POST", url, headers: auth(user.id, user.email) });
  assert.equal(second.statusCode, 204);
  const rows = await masterKnex("platform_user_work_experiences").where({ user_id: user.id });
  assert.equal(rows.length, 1);
});

test("confirming someone else's membership is forbidden", async () => {
  const app = await getApp();
  const owner = await createUser();
  const intruder = await createUser();
  const business = await createBusiness();
  const membership = await addMembership(owner.id, business.id, { position: "Counsellor" });

  const res = await app.inject({
    method: "POST", url: `/api/v3/platform-users/me/position-updates/${membership.id}/confirm`,
    headers: auth(intruder.id, intruder.email),
  });
  assert.equal(res.statusCode, 403);
  assert.equal((await masterKnex("platform_user_work_experiences").where({ user_id: intruder.id })).length, 0);
});

// 11. Own rows only.
test("the summary never counts another user's rows", async () => {
  const app = await getApp();
  const mine = await createUser();
  const theirs = await createUser();
  await createProfile(mine.id);
  await createProfile(theirs.id);
  const [institution] = await masterKnex("institutions")
    .insert({
      platform_user_id: theirs.id, first_name: "X", last_name: "Y", email: "inst@example.com",
      subdomain: `inst-${Date.now()}`, institution_name: "Their Institution",
    })
    .returning("*");

  await masterKnex("enquiries").insert([
    { platform_user_id: theirs.id, message: "not mine" },
    { platform_user_id: theirs.id, message: "also not mine" },
  ]);
  await masterKnex("user_favorites").insert({ platform_user_id: theirs.id, institution_id: institution.id });
  await masterKnex("notifications").insert({ platform_user_id: theirs.id, type: "x", title: "theirs" });

  const res = await app.inject({ method: "GET", url: "/api/v3/personal-home/summary", headers: auth(mine.id, mine.email) });
  const body = res.json();
  assert.equal(res.statusCode, 200);
  assert.equal(body.enquiries_count, 0);
  assert.equal(body.favorites_count, 0);
  assert.equal(body.recent_enquiries.length, 0);

  const unread = await app.inject({
    method: "GET", url: "/api/v3/notifications/unread-count", headers: auth(mine.id, mine.email),
  });
  assert.equal(unread.json().unread, 0);
});

test("the enquiries count is the true total, not the recent slice", async () => {
  const app = await getApp();
  const user = await createUser();
  await createProfile(user.id);
  await masterKnex("enquiries").insert(
    Array.from({ length: 12 }, (_, i) => ({ platform_user_id: user.id, message: `enquiry ${i}` })),
  );

  const res = await app.inject({ method: "GET", url: "/api/v3/personal-home/summary", headers: auth(user.id, user.email) });
  const body = res.json();
  assert.equal(body.enquiries_count, 12, "V2 capped this at 5 by slicing before counting");
  assert.equal(body.recent_enquiries.length, 5, "but only five are listed");
});

// 12. Partial failure — one dead source degrades one card, the page still loads.
test("a failing source returns 200 with the source named in `degraded`", async () => {
  const user = await createUser();
  await createProfile(user.id);

  // A real failure, not a stub: ESM namespaces are immutable, so the favourites query is made to fail by
  // taking its table away for the duration of the call.
  await masterKnex.raw("ALTER TABLE user_favorites RENAME TO user_favorites_offline");
  try {
    const summary = await personalHome.getSummary(user.id);
    assert.ok(summary.degraded.includes("favorites"), "the failed source must be named in `degraded`");
    assert.equal(summary.favorites_count, 0);
    assert.ok(summary.completion, "healthy sources still resolve");
    assert.equal(summary.degraded.includes("completion"), false);
  } finally {
    await masterKnex.raw("ALTER TABLE user_favorites_offline RENAME TO user_favorites");
  }
});

test("the summary route still returns 200 when a source is down", async () => {
  const app = await getApp();
  const user = await createUser();
  await createProfile(user.id);

  await masterKnex.raw("ALTER TABLE enquiries RENAME TO enquiries_offline");
  try {
    const res = await app.inject({
      method: "GET", url: "/api/v3/personal-home/summary", headers: auth(user.id, user.email),
    });
    assert.equal(res.statusCode, 200, "one dead domain must not 500 the whole page");
    assert.ok(res.json().degraded.includes("enquiries"));
  } finally {
    await masterKnex.raw("ALTER TABLE enquiries_offline RENAME TO enquiries");
  }
});

// 13. Favorites integrity.
test("favorites require exactly one target and cascade with it", async () => {
  const user = await createUser();
  const [country] = await masterKnex("countries")
    .insert({ name: "Testland", iso2: "TL", iso3: "TLD" })
    .returning("*")
    .onConflict("name")
    .merge();

  await assert.rejects(
    masterKnex("user_favorites").insert({ platform_user_id: user.id }),
    /user_favorites_one_target_chk/,
    "zero targets must be rejected",
  );

  const [institution] = await masterKnex("institutions")
    .insert({
      platform_user_id: user.id, first_name: "A", last_name: "B", email: "i@example.com",
      subdomain: `inst-${Date.now()}-${Math.round(performance.now())}`, institution_name: "Inst",
    })
    .returning("*");

  await assert.rejects(
    masterKnex("user_favorites").insert({
      platform_user_id: user.id, institution_id: institution.id, country_id: country.id,
    }),
    /user_favorites_one_target_chk/,
    "two targets must be rejected",
  );

  await masterKnex("user_favorites").insert({ platform_user_id: user.id, institution_id: institution.id });
  assert.equal(await favoritesRepo.countForUser(user.id), 1);

  await masterKnex("institutions").where({ id: institution.id }).del();
  assert.equal(await favoritesRepo.countForUser(user.id), 0, "deleting the target cascades the favourite away");
});

// 14d. Soft-delete must not block re-favouriting.
test("a soft-deleted favourite can be re-added", async () => {
  const user = await createUser();
  const [institution] = await masterKnex("institutions")
    .insert({
      platform_user_id: user.id, first_name: "A", last_name: "B", email: "i2@example.com",
      subdomain: `inst2-${Date.now()}-${Math.round(performance.now())}`, institution_name: "Inst2",
    })
    .returning("*");

  const [first] = await masterKnex("user_favorites")
    .insert({ platform_user_id: user.id, institution_id: institution.id })
    .returning("*");

  // A duplicate while live is blocked by the partial unique index.
  await assert.rejects(
    masterKnex("user_favorites").insert({ platform_user_id: user.id, institution_id: institution.id }),
    /user_favorites_institution_uniq/,
  );

  await masterKnex("user_favorites").where({ id: first.id }).update({ deleted_at: masterKnex.fn.now() });

  // Once soft-deleted, re-favouriting must succeed — this is what `WHERE deleted_at IS NULL` buys.
  await masterKnex("user_favorites").insert({ platform_user_id: user.id, institution_id: institution.id });
  assert.equal(await favoritesRepo.countForUser(user.id), 1, "exactly one live favourite");
});
