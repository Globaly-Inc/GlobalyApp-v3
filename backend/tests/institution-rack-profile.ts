/**
 * Institution Knowledge Rack configuration — the prompt block, the stored-shape fallback, and
 * the per-block merge on write.
 *
 * Run: node --import tsx tests/institution-rack-profile.ts   (or: npm run test:institution-rack-profile)
 * Fake wire: tests/institution-memory.harness.ts. No DB needed.
 */

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";
process.env.GEMINI_API_KEY = "test-key";
process.env.EMBEDDING_PROVIDER = "gemini";

const h = await import("./institution-memory.harness.js");
const { assert, reset, find, count, bound, tenantRequests, finish } = h;
const svc = await import("../src/modules/institution-memory/services/profile.service.js");
const schema = await import("../src/modules/institution-memory/schemas/profile.schema.js");
const repo = await import("../src/modules/institution-memory/repositories/profile.repository.js");

const INST = 49;
const SELECT_PROFILE = /from "institution_ai_profile"/i;
const UPSERT = /insert into "institution_ai_profile"/i;

/** A stored row as Postgres hands it back. */
const storedRow = (o: Record<string, unknown>) => ({
  id: 1, voice: {}, behaviour: {}, collection: {}, learning: {},
  version: 3, updated_by: 7, updated_at: new Date("2026-10-01T00:00:00Z"), ...o,
});

const profile = (patch: Record<string, unknown>) =>
  schema.RackProfileSchema.parse({ ...schema.DEFAULT_PROFILE, ...patch });

console.log("\n1. renderProfileBlock — defaults emit the privacy floor and nothing else");
{
  svc.clearProfileCache();
  const block = svc.renderProfileBlock(schema.DEFAULT_PROFILE);
  // NOT empty, and deliberately so: the default allow-list withholds age, gender and phone, and
  // a model that is not told to withhold them will ask. A privacy default that is stricter than
  // the model's own behaviour has to be spent on; everything else is omitted until it changes.
  assert(block.split("\n").length === 3, "defaults emit exactly two instructions", block);
  assert(/Never ask for, and never repeat back, age, gender, their phone number/.test(block),
    "the first is the privacy floor", block);
  assert(/confirm it back to them once/.test(block),
    "the second is the consent posture for volunteered details", block);
  assert(!/Warm and personable|Answer fully|Counsel:/.test(block), "no style line on an untouched profile");
  const d = schema.DEFAULT_PROFILE;
  assert(d.collection.allowed.includes("name") && d.collection.allowed.includes("email"),
    "defaults allow name and email");
  assert(!d.collection.allowed.includes("gender") && !d.collection.allowed.includes("age"),
    "defaults do NOT allow gender or age");
}

console.log("\n2. renderProfileBlock — only what changed");
{
  const block = svc.renderProfileBlock(profile({
    voice: { ...schema.DEFAULT_PROFILE.voice, response_length: "brief", formality: 5 },
  }));
  assert(block.startsWith("COUNSELLING STYLE"), "block is headed COUNSELLING STYLE", block.slice(0, 20));
  assert(/Keep replies short/.test(block), "brief → the short-replies instruction");
  assert(/avoid contractions/.test(block), "formality 5 → the formal instruction");
  assert(!/Warm and personable/.test(block), "an unchanged tone contributes no line");
  assert(/outranks any style the system has learned/.test(block), "says it beats learned style");
}

console.log("\n3. renderProfileBlock — collection rules");
{
  const block = svc.renderProfileBlock(profile({
    collection: {
      ...schema.DEFAULT_PROFILE.collection,
      allowed: ["study_preference", "nationality"],
      sensitive: ["work_experiences"],
      may_ask_for: ["study_preference", "nationality"],
    },
  }));
  assert(/Never ask for, and never repeat back/.test(block), "dropped contact fields produce a never-ask line");
  assert(/their name/.test(block) && /their email/.test(block), "names the fields in plain words");
  assert(/use it to answer, never record it/.test(block), "sensitive fields are usable but not stored");
  assert(/You may ask directly for: the course they want, nationality/.test(block),
    "a changed may_ask_for is rendered in plain words", block);
  const dflt = svc.renderProfileBlock(schema.DEFAULT_PROFILE);
  assert(!/You may ask directly for/.test(dflt), "but the default may_ask_for costs no line");

  const off = svc.renderProfileBlock(profile({
    collection: { ...schema.DEFAULT_PROFILE.collection, contact_ask: { enabled: false, first_at: [3, 5], gap: [5, 10] } },
  }));
  assert(/Never ask for contact details/.test(off), "contact_ask disabled is stated outright");

  const noEmail = svc.renderProfileBlock(profile({
    collection: { ...schema.DEFAULT_PROFILE.collection, allowed: ["study_preference"], may_ask_for: ["study_preference"], sensitive: [] },
  }));
  assert(!/confirm it back/.test(noEmail), "an institution that does not collect email is not told to confirm one");
}

console.log("\n4. repo.get — a stored shape that fails its schema falls back to defaults");
{
  svc.clearProfileCache();
  reset([[SELECT_PROFILE, () => [storedRow({ voice: { tone: "sarcastic", formality: 99 } })]]]);
  const stored = await repo.get(INST);
  assert(stored.profile.voice.tone === "warm", "a bad enum does not reach the renderer", stored.profile.voice.tone);
  assert(stored.configured === true, "but the row is still reported as configured");
  assert(svc.renderProfileBlock(stored.profile) === svc.renderProfileBlock(schema.DEFAULT_PROFILE),
    "and the block is the default one rather than a malformed one");
}

console.log("\n5. repo.get — no row at all, and the institution's own schema");
{
  svc.clearProfileCache();
  reset([[SELECT_PROFILE, () => []]]);
  const stored = await repo.get(INST);
  assert(stored.configured === false, "no row → not configured");
  assert(stored.version === 0, "no row → version 0");
  assert(stored.profile.voice.tone === "warm", "no row → full defaults");
  assert(tenantRequests.length === 1 && tenantRequests[0] === INST,
    "read went to this institution's schema and no other", tenantRequests);
}

console.log("\n6. patchProfile — merges per block, upserts, and bumps the version");
{
  svc.clearProfileCache();
  reset([
    [UPSERT, () => [storedRow({ version: 4 })]],
    [SELECT_PROFILE, () => [storedRow({ voice: { tone: "formal", response_length: "detailed" } })]],
  ]);
  const saved = await svc.patchProfile(INST, { voice: { response_length: "brief" } }, 7);
  assert(saved.profile.voice.response_length === "brief", "the patched field wins");
  assert(saved.profile.voice.tone === "formal", "an untouched field in the SAME block survives the merge");
  assert(saved.profile.behaviour.counselling_style === "consultative", "untouched blocks keep their values");
  assert(count(UPSERT) === 1, "one statement, not a select-then-insert race", count(UPSERT));
  const sql = find(UPSERT)?.text ?? "";
  assert(/on conflict \("id"\) do update/i.test(sql), "upsert, so the first save creates the row", sql.slice(0, 120));
  assert(/institution_ai_profile\.version \+ 1/i.test(sql), "version is bumped in SQL, not read-modify-written", sql);
  assert(bound(UPSERT).includes(7), "updated_by carries the member who saved it");
}

console.log("\n7. getProfile — cached, and the cache is cleared by a write");
{
  svc.clearProfileCache();
  reset([[SELECT_PROFILE, () => [storedRow({})]]]);
  await svc.getProfile(INST);
  await svc.getProfile(INST);
  assert(count(SELECT_PROFILE) === 1, "second read inside the TTL hits the cache", count(SELECT_PROFILE));

  reset([
    [UPSERT, () => [storedRow({ version: 5 })]],
    [SELECT_PROFILE, () => [storedRow({})]],
  ]);
  await svc.patchProfile(INST, { learning: { auto_learn: true } }, 7);
  await svc.getProfile(INST);
  assert(count(SELECT_PROFILE) === 2, "a write invalidates it: one read for the merge, one after", count(SELECT_PROFILE));
}

await finish();
