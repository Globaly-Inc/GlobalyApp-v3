/**
 * Feed visibility matrix — the personal/business portal boundary.
 * Run: DB_NAME=globalyapp_test npm run test:feed-visibility
 *
 * Style matches tests/referrals.ts: a plain tsx script with manual counters, no framework, fixtures
 * inserted directly and never deleted (hence the _test database guard below).
 *
 * It calls the repository, not HTTP, on purpose: the rule under test IS the WHERE clause. A mocked data
 * layer would pass vacuously, and going through the server would only add a transport that cannot fail
 * differently.
 *
 * The rule, in one line: "everyone" crosses between a user's personal and business portals; every
 * narrower audience stays in the portal it was written from. Owning a post is NOT enough to see it in
 * both.
 */

import { masterKnex } from "../src/core/db/master-pool.js";
import { config } from "../src/config.js";
import * as repo from "../src/modules/feed/repositories/feed.repository.js";
import * as service from "../src/modules/feed/services/feed.service.js";

// ── Guard: dedicated test database only ─────────────────────────────────────────────────────────
if (!/_test$/.test(config.DB_NAME)) {
  console.error(
    `\nREFUSING TO RUN.\n\n` +
      `  DB_NAME is "${config.DB_NAME}", which does not end in "_test".\n\n` +
      `  This suite inserts platform_users, businesses and feed_posts fixtures it never deletes.\n\n` +
      `    DB_NAME=${config.DB_NAME}_test npm run test:feed-visibility\n`,
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

/** Unique per run, so fixtures never collide with previous runs (nothing is deleted). */
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = () => `${RUN}${(seq++).toString(36)}`;

async function makeUser(opts: {
  personal?: boolean;
  category?: string | null;
  /** Any ONE of these should be enough to make a personal user a "student" — see viewerAudience. */
  studyPreferences?: boolean;
  qualification?: boolean;
  languageTest?: boolean;
}) {
  const tag = uniq();
  const [u] = await masterKnex("platform_users")
    .insert({
      first_name: `F${tag}`,
      last_name: "Feed",
      email: `feed-${tag}@test.local`,
      account_status: 1,
      is_personal_account: opts.personal ?? true,
    })
    .returning("id");
  const id = Number((u as { id: number }).id);
  if (opts.category !== undefined || opts.studyPreferences) {
    await masterKnex("platform_user_profiles").insert({
      user_id: id,
      individual_category: opts.category ?? null,
      // One preference is the whole point — the rule is OR, not AND.
      ...(opts.studyPreferences ? { preferred_destinations: JSON.stringify([1]) } : {}),
    });
  }
  if (opts.qualification) {
    await masterKnex("platform_user_qualifications").insert({ user_id: id, degree_title: "BSc" });
  }
  if (opts.languageTest) {
    await masterKnex("platform_user_language_tests").insert({ user_id: id, test_type: "IELTS", overall_score: "7" });
  }
  return id;
}

async function makeBusiness(ownerId: number, members: number[]) {
  const tag = uniq();
  const [b] = await masterKnex("businesses")
    .insert({
      owner_id: ownerId,
      subdomain: `feed-${tag}`,
      business_name: `Feed Biz ${tag}`,
      status: "approved",
      account_status: 1,
    })
    .returning("id");
  const id = Number((b as { id: number }).id);
  for (const platform_user_id of members) {
    await masterKnex("user_business_index").insert({ platform_user_id, business_id: id, role: "member" });
  }
  return id;
}

async function makePost(authorId: number, businessId: number | null, visibility: string) {
  const row = await repo.insertPost({
    author_platform_user_id: authorId,
    business_id: businessId,
    post_type: "social",
    visibility,
    content: `fixture ${uniq()}`,
    media: [],
  });
  return row.id;
}

/**
 * What does this viewer see in this portal? Returns the ids, so each assertion below is a membership
 * test against the fixtures this run created and stays correct on an already-populated database.
 */
async function visibleTo(viewerId: number, viewingAsBusinessId: number | null): Promise<Set<number>> {
  const audience = await repo.viewerAudience(viewerId);
  const page = await repo.listPosts({
    viewerId,
    viewerIsPersonal: audience.isPersonal,
    viewerIsStudent: audience.isStudent,
    viewingAsBusinessId,
    limit: 500,
  });
  return new Set(page.posts.map((p) => p.id));
}

async function main() {
  console.log(`\nFeed visibility matrix (run ${RUN})\n`);

  // ── Fixtures ──────────────────────────────────────────────────────────────────────────────────
  // personA is the case the whole feature exists for: one human with BOTH a personal portal and a
  // business portal.
  const personA = await makeUser({ personal: true, category: "student" });
  const bizA = await makeBusiness(personA, [personA]);

  // A second member of bizA, to check that "the business is an audience for itself" is not the same
  // thing as "colleagues can read each other's private posts".
  const memberA2 = await makeUser({ personal: true, category: "student" });
  await masterKnex("user_business_index").insert({ platform_user_id: memberA2, business_id: bizA, role: "member" });

  // A stranger's business — personA is not a member.
  const personB = await makeUser({ personal: true, category: "student" });
  const bizB = await makeBusiness(personB, [personB]);

  // A personal user with an empty profile — no category, no preferences, no qualifications, no tests. The
  // students audience has to genuinely exclude someone or every assertion about it passes vacuously.
  const personC = await makeUser({ personal: true, category: "explorer" });

  const P = {
    ownPersonalEveryone: await makePost(personA, null, "everyone"),
    ownPersonalStudents: await makePost(personA, null, "students"),
    ownPersonalPrivate: await makePost(personA, null, "private"),
    ownBizEveryone: await makePost(personA, bizA, "everyone"),
    ownBizStudents: await makePost(personA, bizA, "students"),
    ownBizBusiness: await makePost(personA, bizA, "business"),
    colleagueBizPrivate: await makePost(memberA2, bizA, "private"),
    otherPersonalEveryone: await makePost(personB, null, "everyone"),
    otherPersonalStudents: await makePost(personB, null, "students"),
    otherBizEveryone: await makePost(personB, bizB, "everyone"),
    otherBizStudents: await makePost(personB, bizB, "students"),
  };

  const personal = await visibleTo(personA, null);
  const business = await visibleTo(personA, bizA);

  // ── The matrix, exactly as specified ──────────────────────────────────────────────────────────
  console.log("\n Own posts across portals");
  check("M1", "personal + everyone → visible in personal", personal.has(P.ownPersonalEveryone));
  check("M2", "personal + everyone → visible in business", business.has(P.ownPersonalEveryone));
  check("M3", "personal + students → visible in personal", personal.has(P.ownPersonalStudents));
  check("M4", "personal + students → NOT visible in business", !business.has(P.ownPersonalStudents));
  check("M5", "business + everyone → visible in business", business.has(P.ownBizEveryone));
  check("M6", "business + everyone → visible in personal", personal.has(P.ownBizEveryone));
  check("M7", "business + students → visible in business", business.has(P.ownBizStudents));
  check("M8", "business + students → NOT visible in personal", !personal.has(P.ownBizStudents));

  console.log("\n Private and business-scoped audiences");
  check("P1", "own private → visible in the portal it was written from", personal.has(P.ownPersonalPrivate));
  check("P2", "own private → NOT visible in the other portal", !business.has(P.ownPersonalPrivate));
  check("P3", "'business' visibility → visible in that business's portal", business.has(P.ownBizBusiness));
  check("P4", "'business' visibility → NOT visible in the personal portal", !personal.has(P.ownBizBusiness));
  check("P5", "a colleague's private business post stays private", !business.has(P.colleagueBizPrivate));
  check(
    "P6",
    "its own author still sees it in the business portal",
    (await visibleTo(memberA2, bizA)).has(P.colleagueBizPrivate),
  );

  console.log("\n Other users' posts follow the normal audience rules");
  check("O1", "another user's everyone post → visible in personal", personal.has(P.otherPersonalEveryone));
  check("O2", "another user's everyone post → visible in business", business.has(P.otherPersonalEveryone));
  check("O3", "another student's students post → visible to a student in personal", personal.has(P.otherPersonalStudents));
  check("O4", "another student's students post → NOT visible in the business portal", !business.has(P.otherPersonalStudents));
  check("O5", "another business's everyone post → visible in personal", personal.has(P.otherBizEveryone));
  check("O6", "another business's students post → NOT visible in personal", !personal.has(P.otherBizStudents));
  check("O7", "another business's students post → NOT visible in my business portal", !business.has(P.otherBizStudents));

  const nonStudent = await visibleTo(personC, null);
  check("O8", "a non-student does not see students posts", !nonStudent.has(P.otherPersonalStudents));
  check("O9", "a non-student still sees everyone posts", nonStudent.has(P.otherPersonalEveryone));

  // ── Who counts as a student ───────────────────────────────────────────────────────────────────
  // individual_category is NULL on every profile that predates personal onboarding capturing it, so the
  // behavioural signals carry this audience. Each is tested ALONE: the rule is OR, not AND.
  console.log("\n Student audience — each signal on its own");
  const byStudyPrefs = await makeUser({ personal: true, studyPreferences: true });
  const byQualification = await makeUser({ personal: true, qualification: true });
  const byLanguageTest = await makeUser({ personal: true, languageTest: true });
  const byCategory = await makeUser({ personal: true, category: "student" });
  const noProfileAtAll = await makeUser({ personal: true });
  // Profile rows but no personal portal — being a student is a property of the personal portal.
  const businessOnly = await makeUser({ personal: false, qualification: true, languageTest: true });

  for (const [id, viewer, expected] of [
    ["S1", byStudyPrefs, true],
    ["S2", byQualification, true],
    ["S3", byLanguageTest, true],
    ["S4", byCategory, true],
    ["S5", noProfileAtAll, false],
    ["S6", businessOnly, false],
  ] as [string, number, boolean][]) {
    const audience = await repo.viewerAudience(viewer);
    const label = {
      S1: "study preferences alone → student",
      S2: "education background alone → student",
      S3: "test score alone → student",
      S4: "individual_category 'student' → student",
      S5: "empty personal profile → NOT a student",
      S6: "business-only login with profile rows → NOT a student",
    }[id]!;
    check(id, label, audience.isStudent === expected, { isStudent: audience.isStudent, expected });
  }

  check(
    "S7",
    "a study-preferences student receives another user's students post",
    (await visibleTo(byStudyPrefs, null)).has(P.otherPersonalStudents),
  );
  check(
    "S8",
    "an empty personal profile does not",
    !(await visibleTo(noProfileAtAll, null)).has(P.otherPersonalStudents),
  );

  console.log("\n Context is authorized, not merely claimed");
  try {
    await service.listPosts(personA, { businessId: bizB, limit: 20 });
    check("A1", "reading a business you don't belong to is refused", false, "expected a throw, got none");
  } catch (err) {
    check("A1", "reading a business you don't belong to is refused", (err as Error).name === "ForbiddenError", {
      name: (err as Error).name,
      message: (err as Error).message,
    });
  }
  const asOwnBiz = await service.listPosts(personA, { businessId: bizA, limit: 500 });
  check("A2", "reading your own business is allowed", asOwnBiz.posts.some((p) => p.id === P.ownBizStudents));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) console.log(failures.map((f) => `  ${f}`).join("\n"));
  await masterKnex.destroy();
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await masterKnex.destroy();
  process.exit(1);
});
