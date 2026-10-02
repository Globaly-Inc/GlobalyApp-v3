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
// Unquoted: the write is raw SQL now (it merges jsonb in Postgres), so the table name carries
// no identifier quotes the way a knex builder would add.
const UPSERT = /insert into "?institution_ai_profile"?/i;

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
  // Since age and gender joined the defaults (2026-10-02) nothing is withheld by default, so no
  // privacy-floor line: just the reply language and the consent posture for volunteered details.
  assert(block.split("\n").length === 3, "defaults emit exactly two instructions", block);
  assert(/Reply in English unless they write in another language/.test(block),
    "the default language is stated in words, not as a tag", block);
  assert(!/Never ask for/.test(block),
    "no privacy floor when nothing is withheld", block);
  assert(/confirm it back to them once/.test(block),
    "and the consent posture for volunteered details is spelled out", block);
  assert(!/Warm and personable|Answer fully|Counsel:/.test(block), "no style line on an untouched profile");
  const d = schema.DEFAULT_PROFILE;
  assert(d.voice.language === "en", "English is the default reply language");
  assert(d.collection.allowed.includes("gender") && d.collection.allowed.includes("age"),
    "defaults record gender and age");
}

console.log("\n1b. contact details are always recorded and carry no choice at all");
{
  // The portal offers no control for these, so the SCHEMA is where the rule has to hold: an API
  // caller that drops email, or marks a phone number sensitive, must not leave storage and the
  // prompt disagreeing about whether the field exists.
  const parsed = schema.CollectionSchema.parse({
    allowed: ["study_preference"],
    sensitive: ["email", "work_experiences"],
    may_ask_for: ["phone", "study_preference"],
  });
  for (const f of schema.CONTACT_FIELDS) {
    assert(parsed.allowed.includes(f), `${f} is forced back into allowed`, parsed.allowed);
    assert(!parsed.sensitive.includes(f), `${f} cannot be marked sensitive`, parsed.sensitive);
    assert(!parsed.may_ask_for.includes(f), `${f} carries no may-ask choice`, parsed.may_ask_for);
  }
  assert(parsed.allowed.filter((f) => f === "email").length === 1, "and no field is duplicated", parsed.allowed);
  assert(parsed.sensitive.includes("work_experiences") && parsed.may_ask_for.includes("study_preference"),
    "every other field keeps the choice it was given", parsed);

  const d = schema.DEFAULT_PROFILE.collection;
  for (const f of schema.CONTACT_FIELDS) {
    assert(d.allowed.includes(f), `${f} is recorded by default too`, d.allowed);
  }

  // The prompt end of the same rule: the never-ask line can only ever name age and gender now.
  const withheld = svc.renderProfileBlock(schema.DEFAULT_PROFILE);
  assert(!/their phone number|their name|their email/.test(withheld),
    "so no contact field is ever named as off-limits", withheld);
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

console.log("\n2b. mayKeepEmail — the one predicate both contact gates use");
{
  const rack = (allowed: string[], degraded = false) => ({
    profile: { ...schema.DEFAULT_PROFILE, collection: { ...schema.DEFAULT_PROFILE.collection, allowed } },
    version: 1, updated_at: null, configured: true, degraded,
  } as never);

  assert(svc.mayKeepEmail(null), "no Rack at all → the built-in behaviour, which keeps email");
  assert(svc.mayKeepEmail(rack(["email", "nationality"])), "email allowed → yes");
  assert(!svc.mayKeepEmail(rack(["nationality"])), "email switched off → no");
  // Degraded means the stored rules would not parse. Defaults are WIDER than a narrowed set, so
  // falling back to them would quietly re-enable collection a database blip had nothing to say
  // about. "We do not know what we may keep" is not permission.
  assert(!svc.mayKeepEmail(rack(["email"], true)), "rules unreadable → no, even though email is listed");
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
  assert(/Never ask for, and never repeat back, age, gender\./.test(block),
    "dropped fields produce a never-ask line naming them in plain words", block);
  assert(!/their name|their email|their phone number/.test(block),
    "contact details are never in it — they cannot be dropped", block);
  assert(/use it to answer, never record it/.test(block), "sensitive fields are usable but not stored");
  assert(/You may ask directly for: the course they want, nationality/.test(block),
    "a changed may_ask_for is rendered in plain words", block);
  const dflt = svc.renderProfileBlock(schema.DEFAULT_PROFILE);
  assert(!/You may ask directly for/.test(dflt), "but the default may_ask_for costs no line");

  const off = svc.renderProfileBlock(profile({
    collection: { ...schema.DEFAULT_PROFILE.collection, contact_ask: { enabled: false, first_at: [3, 5], gap: [5, 10] } },
  }));
  assert(/Never ask for contact details/.test(off), "contact_ask disabled is stated outright");

  // The consent posture is spent only when email is actually collectable. Rendering
  // "confirm the address back" for an institution that does not keep addresses would be an
  // instruction about something that never happens.
  const withEmail = svc.renderProfileBlock(profile({
    collection: { ...schema.DEFAULT_PROFILE.collection, allowed: ["study_preference", "email"], may_ask_for: ["study_preference"], sensitive: [] },
  }));
  assert(/confirm it back/.test(withEmail),
    "email collectable → the confirm-don't-harvest line is spent", withEmail);

  const narrowed = svc.renderProfileBlock(profile({
    collection: { ...schema.DEFAULT_PROFILE.collection, allowed: ["study_preference"], may_ask_for: ["study_preference"], sensitive: [] },
  }));
  assert(/confirm it back/.test(narrowed),
    "email is collected whatever else is switched off, so the consent posture always applies", narrowed);
}

console.log("\n3c. custom fields — the institution's own subjects");
{
  const parse = (custom: unknown) => schema.CollectionSchema.parse({ ...schema.DEFAULT_PROFILE.collection, custom });

  assert(schema.DEFAULT_PROFILE.collection.custom.length === 0, "none by default");

  const ok = parse([{ key: "preferred_intake", label: "  Preferred\n intake ", may_ask: true }]);
  assert(ok.custom[0].label === "Preferred intake",
    "the label is whitespace-collapsed — it rides the line-delimited profile block, where a pasted newline breaks every bullet after it",
    ok.custom[0].label);
  assert(ok.custom[0].key === "preferred_intake" && ok.custom[0].may_ask === true, "key and may_ask survive", ok.custom[0]);

  const deduped = parse([
    { key: "budget", label: "Budget", may_ask: false },
    { key: "budget", label: "Budget per year", may_ask: true },
  ]);
  assert(deduped.custom.length === 1 && deduped.custom[0].label === "Budget per year",
    "one entry per key, last wins — two rows for one key would both be filled by the extractor", deduped.custom);

  for (const bad of ["Preferred Intake", "preferred intake", "", "a".repeat(41)]) {
    assert(!schema.CollectionSchema.safeParse({ custom: [{ key: bad, label: "x" }] }).success,
      `a key the storage cannot use is rejected: ${JSON.stringify(bad)}`);
  }
  assert(!schema.CollectionSchema.safeParse({
    custom: Array.from({ length: schema.CUSTOM_FIELD_MAX + 1 }, (_, i) => ({ key: `f${i}`, label: `F${i}` })),
  }).success, "and the list has a ceiling");

  // The prompt end. A subject the counsellor may raise rides the SAME bullet as the fixed
  // fields — that line is paid on every turn, and two sentences would say one thing twice.
  const asks = svc.renderProfileBlock(profile({
    collection: { ...schema.DEFAULT_PROFILE.collection, custom: [
      { key: "preferred_intake", label: "Preferred intake", may_ask: true },
      { key: "budget", label: "Budget", may_ask: false },
    ] },
  }));
  assert(/You may ask directly for: the course they want, Preferred intake\./.test(asks),
    "a may-ask custom subject joins the existing bullet", asks);
  assert(!/Budget/.test(asks),
    "and one it may only record if offered costs no prompt line at all", asks);
  assert(svc.renderProfileBlock(profile({
    collection: { ...schema.DEFAULT_PROFILE.collection, custom: [{ key: "budget", label: "Budget", may_ask: false }] },
  })).split("\n").length === 3, "so defining a record-only field changes the block not at all");
}

console.log("\n4. repo.get — a stored shape that fails its schema falls back to defaults");
{
  svc.clearProfileCache();
  reset([[SELECT_PROFILE, () => [storedRow({ voice: { tone: "sarcastic", formality: 99 } })]]]);
  const stored = await repo.get(INST);
  assert(stored.profile.voice.tone === "warm", "a bad enum does not reach the renderer", stored.profile.voice.tone);
  assert(stored.configured === true, "but the row is still reported as configured");
  assert(stored.degraded === true,
    "and flagged degraded — these defaults are a guess, so permissions must not be read off them");
  assert(svc.renderProfileBlock(stored.profile) === svc.renderProfileBlock(schema.DEFAULT_PROFILE),
    "and the block is the default one rather than a malformed one");
}

console.log("\n5. repo.get — no row at all, and the institution's own schema");
{
  svc.clearProfileCache();
  reset([[SELECT_PROFILE, () => []]]);
  const stored = await repo.get(INST);
  assert(stored.configured === false, "no row → not configured");
  assert(stored.degraded === false,
    "no row is a FACT, not a failure — these defaults really are what applies");
  assert(stored.version === 0, "no row → version 0");
  assert(stored.profile.voice.tone === "warm", "no row → full defaults");
  assert(tenantRequests.length === 1 && tenantRequests[0] === INST,
    "read went to this institution's schema and no other", tenantRequests);
}

console.log("\n6. patchProfile — merges in SQL, writes only the blocks it was given");
{
  svc.clearProfileCache();
  reset([
    [UPSERT, () => [storedRow({ version: 4, voice: { tone: "formal", response_length: "brief" } })]],
    [SELECT_PROFILE, () => [storedRow({})]],
  ]);
  const saved = await svc.patchProfile(INST, { voice: { response_length: "brief" } }, 7, 3);

  assert(count(SELECT_PROFILE) === 0,
    "NO read before the write — the read-modify-write is what let one member's save revert another's",
    count(SELECT_PROFILE));
  assert(count(UPSERT) === 1, "one statement", count(UPSERT));

  const sql = find(UPSERT)?.text ?? "";
  assert(/voice\s+= institution_ai_profile\.voice\s+\|\|/i.test(sql),
    "each block is merged against the STORED value in SQL, not against one this process read", sql);
  assert(/institution_ai_profile\.version \+ 1/i.test(sql), "version is bumped in SQL");
  assert(/where institution_ai_profile\.version = /i.test(sql),
    "and the write applies only to the version the editor was built from", sql);

  // The bug Greptile reported: a voice-only save must not carry `collection` at all.
  const values = bound(UPSERT);
  const collectionBindings = values.filter((v) => typeof v === "string" && v.includes("allowed"));
  assert(collectionBindings.length === 0,
    "a voice-only save sends NO collection payload, so it cannot restore permissions someone just removed",
    collectionBindings);
  assert(values.filter((v) => v === null).length >= 6,
    "the blocks it was not given are bound as null and COALESCE'd away", values.length);
  assert(values.includes(7), "updated_by carries the member who saved it");
  assert(values.includes(3), "the expected version is bound");
  assert(saved.profile.voice.response_length === "brief", "the saved row comes back parsed");
}

console.log("\n6b. patchProfile — a concurrent save is a conflict, not a silent merge");
{
  svc.clearProfileCache();
  // The WHERE matched nothing: someone else saved between the editor's read and this write.
  reset([[UPSERT, () => []]]);
  let threw: unknown = null;
  await svc.patchProfile(INST, { voice: { tone: "formal" } }, 7, 3).catch((e) => { threw = e; });
  assert(threw !== null, "a stale version does not silently win");
  // Guarded: without this a regression crashes the whole run on `null.message` and the two
  // assertions below never report at all.
  const err = threw as (Error & { statusCode?: number }) | null;
  assert(!!err && String(err.message).includes("Someone else changed"),
    "and the message tells the editor what happened", err?.message);
  assert(!!err && (err.statusCode === 409 || err.constructor.name === "ConflictError"),
    "surfaced as a conflict", err?.constructor.name);
}

console.log("\n6c. a failed read is degraded, so permissions are not read off its defaults");
{
  svc.clearProfileCache();
  reset([[SELECT_PROFILE, () => { throw new Error("connection terminated"); }]]);
  const stored = await repo.get(INST);
  assert(stored.degraded === true, "a throwing read is flagged degraded, not served as fact");
  assert(stored.profile.collection.allowed.length > 0,
    "the defaults it carries are still the real defaults — the flag is what callers branch on");
  // The hazard in one line: the default allow-list is WIDER than a narrowed one, so a caller
  // that trusted these would extract and store fields the institution had switched off.
  assert(stored.profile.collection.allowed.includes("nationality")
    && stored.profile.collection.allowed.includes("work_experiences"),
    "which is why failing open here would widen what the widget may store");
}

console.log("\n6d. a reversed ask range is rejected, and cannot silently mute the card");
{
  const range = (first: [number, number]) => schema.CollectionSchema.safeParse({
    ...schema.DEFAULT_PROFILE.collection,
    contact_ask: { enabled: true, first_at: first, gap: [5, 10] },
  });
  assert(range([3, 5]).success, "an ordered range is accepted");
  assert(range([4, 4]).success, "a single-value range is accepted — min == max is a fixed point, not an error");
  assert(!range([5, 4]).success,
    "a REVERSED range is rejected: askAt would compute a zero span, % 0 is NaN, and every "
    + "threshold comparison is then false forever");
  assert(!schema.CollectionSchema.safeParse({
    ...schema.DEFAULT_PROFILE.collection,
    contact_ask: { enabled: true, first_at: [3, 5], gap: [10, 5] },
  }).success, "and the gap range is checked the same way");
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
  await svc.patchProfile(INST, { learning: { auto_learn: true } }, 7, 3);
  await svc.getProfile(INST);
  // ONE read, not two. The write itself no longer reads — the merge happens in Postgres — so the
  // only SELECT here is the one the invalidated cache forces afterwards.
  assert(count(SELECT_PROFILE) === 1, "a write invalidates the cache and reads nothing itself", count(SELECT_PROFILE));
}

await finish();
