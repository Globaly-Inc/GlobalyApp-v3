import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getApp, closeApp, resetDb, createUser, createProfile, auth, masterKnex } from "./helpers.js";
import { scoreCompletion, computeCompletion } from "../src/modules/platform-users/services/profile-completion.service.js";

before(async () => {
  await getApp();
});
after(closeApp);
beforeEach(resetDb);

// 1. All ten points must be reachable. If they aren't, the completion card can never disappear and the
// enquiry gate can never open — the exact V2 bug (its SQL topped out at 9/10).
test("a fully filled profile reaches 100%", () => {
  const full = scoreCompletion({
    first_name: "A", last_name: "B", photo_url: "p.jpg",
    nationality_id: 1, country_of_residence_id: 2,
    budget_min: 1000, budget_max: 5000, preferred_destinations: [1, 2],
    qualification_count: 1, language_test_count: 1,
  });
  assert.equal(full.percentage, 100);
  assert.ok(full.badges.every((b) => b.done), "every badge must be done at 100%");
});

test("an empty profile is 0% with no badges done", () => {
  const empty = scoreCompletion({
    first_name: null, last_name: null, photo_url: null,
    nationality_id: null, country_of_residence_id: null,
    budget_min: null, budget_max: null, preferred_destinations: null,
    qualification_count: 0, language_test_count: 0,
  });
  assert.equal(empty.percentage, 0);
  assert.ok(empty.badges.every((b) => !b.done));
});

// The badges and the number come from one pass, so "all badges done" and "< 100%" cannot coexist.
test("badges and percentage never disagree across partial profiles", () => {
  const combos = [
    { qualification_count: 1, language_test_count: 0 },
    { qualification_count: 0, language_test_count: 1 },
    { first_name: "A", last_name: "B" },
    { photo_url: "x.png" },
    { budget_min: 1, budget_max: 2, preferred_destinations: [3] },
  ];
  for (const partial of combos) {
    const result = scoreCompletion({
      first_name: null, last_name: null, photo_url: null,
      nationality_id: null, country_of_residence_id: null,
      budget_min: null, budget_max: null, preferred_destinations: null,
      qualification_count: 0, language_test_count: 0,
      ...partial,
    });
    const allDone = result.badges.every((b) => b.done);
    assert.equal(allDone, result.percentage === 100, `badges/percentage mismatch for ${JSON.stringify(partial)}`);
  }
});

test("jsonb preferred_destinations counts whether it arrives as an array or a JSON string", () => {
  const base = {
    first_name: null, last_name: null, photo_url: null,
    nationality_id: null, country_of_residence_id: null,
    budget_min: null, budget_max: null,
    qualification_count: 0, language_test_count: 0,
  };
  assert.equal(scoreCompletion({ ...base, preferred_destinations: [1] }).percentage, 10);
  assert.equal(scoreCompletion({ ...base, preferred_destinations: "[1]" }).percentage, 10);
  assert.equal(scoreCompletion({ ...base, preferred_destinations: "[]" }).percentage, 0);
});

// 1 (persistence). Every scoring write must leave the stored column correct, because the gate reads it.
test("the stored column is refreshed by scoring writes but not by work-experience writes", async () => {
  const app = await getApp();
  const user = await createUser({ first_name: "A", last_name: "B" });
  await createProfile(user.id);

  await app.inject({
    method: "PATCH", url: "/api/v3/platform-users/me",
    headers: auth(user.id, user.email),
    payload: { nationality_id: null, country_of_residence_id: null, budget_min: 1000, budget_max: 5000 },
  });

  const afterProfile = await masterKnex("platform_user_profiles").where({ user_id: user.id }).first();
  const expected = (await computeCompletion(user.id)).percentage;
  assert.equal(Number(afterProfile.completion_percentage), expected);

  // Language test scores a point → column must move.
  const before = Number(afterProfile.completion_percentage);
  const testRes = await app.inject({
    method: "POST", url: "/api/v3/platform-users/me/language-tests",
    headers: auth(user.id, user.email),
    payload: { test_type: "IELTS", overall_score: "7.0" },
  });
  assert.equal(testRes.statusCode, 201);
  const afterTest = await masterKnex("platform_user_profiles").where({ user_id: user.id }).first();
  assert.ok(Number(afterTest.completion_percentage) > before, "a language test must raise the stored percentage");

  // Work experience scores nothing → column must NOT move.
  const stable = Number(afterTest.completion_percentage);
  await app.inject({
    method: "POST", url: "/api/v3/platform-users/me/work-experiences",
    headers: auth(user.id, user.email),
    payload: { job_title: "Intern" },
  });
  const afterWork = await masterKnex("platform_user_profiles").where({ user_id: user.id }).first();
  assert.equal(Number(afterWork.completion_percentage), stable);
});

// 2. Gate bypass: a client-supplied percentage must never reach the column the gate reads.
test("a client-supplied completion percentage cannot reach the stored column", async () => {
  const app = await getApp();
  const user = await createUser({ first_name: "A", last_name: "B" });
  await createProfile(user.id, { completion_percentage: 0 });

  // ProfilePatchSchema is .strict(), so a forged completion field is rejected outright rather than stripped.
  const forged = await app.inject({
    method: "PATCH", url: "/api/v3/platform-users/me",
    headers: auth(user.id, user.email),
    payload: { completion_percentage: 100, budget_min: 1 },
  });
  assert.equal(forged.statusCode, 400, "unknown keys must be rejected");
  const untouched = await masterKnex("platform_user_profiles").where({ user_id: user.id }).first();
  assert.equal(Number(untouched.completion_percentage), 0, "a rejected patch must not write anything");

  // And a legitimate patch stores exactly what the service computed — never a client value.
  const valid = await app.inject({
    method: "PATCH", url: "/api/v3/platform-users/me",
    headers: auth(user.id, user.email),
    payload: { budget_min: 1000, budget_max: 5000 },
  });
  assert.equal(valid.statusCode, 200);
  const row = await masterKnex("platform_user_profiles").where({ user_id: user.id }).first();
  assert.equal(Number(row.completion_percentage), (await computeCompletion(user.id)).percentage);
  assert.notEqual(Number(row.completion_percentage), 100);
});

test("GET /me returns the computed completion, not a stale stored value", async () => {
  const app = await getApp();
  const user = await createUser({ first_name: "A", last_name: "B", photo_url: "x.png" });
  await createProfile(user.id, { completion_percentage: 99 }); // deliberately wrong

  const res = await app.inject({ method: "GET", url: "/api/v3/platform-users/me", headers: auth(user.id, user.email) });
  const body = res.json();
  assert.equal(res.statusCode, 200);
  assert.notEqual(body.completion.percentage, 99);
  assert.equal(body.completion.percentage, (await computeCompletion(user.id)).percentage);
});

// 1b. Backfill: stale stored values must be corrected, and a second run must be a no-op.
test("backfill corrects stale stored percentages and is idempotent", async () => {
  const users = [];
  for (const stale of [0, 55, 99]) {
    const user = await createUser({ first_name: "A", last_name: "B" });
    await createProfile(user.id, { completion_percentage: stale });
    users.push(user);
  }

  const { execFileSync } = await import("node:child_process");
  const run = () =>
    execFileSync(process.execPath, ["--import", "tsx", "scripts/backfill-completion.ts"], {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
    });

  const first = run();
  assert.match(first, /changed [1-9]/, "first run must change rows");

  for (const user of users) {
    const row = await masterKnex("platform_user_profiles").where({ user_id: user.id }).first();
    assert.equal(Number(row.completion_percentage), (await computeCompletion(user.id)).percentage);
  }

  const second = run();
  assert.match(second, /changed 0/, "a second run must change nothing");
});
