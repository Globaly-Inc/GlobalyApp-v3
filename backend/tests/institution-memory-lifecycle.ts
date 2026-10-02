/**
 * Institution memory lifecycle — create, dedupe, reinforce, promote, revive, reject, vote,
 * edit, sweep.
 *
 * Run: node --import tsx tests/institution-memory-lifecycle.ts   (or: npm run test:institution-memory-lifecycle)
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
const { assert, reset, all, count, find, bound, row, INST, ID, ID2, HEX, INSERT_MEMORY, UPDATE_MEMORY, SELECT_MEMORY, MATCH_FN, PROMOTE } = h;
const svc = await import("../src/modules/institution-memory/services/memory.service.js");
const repo = await import("../src/modules/institution-memory/repositories/memory.repository.js");
const { CreateMemorySchema, PatchMemorySchema, MemoryRowSchema, ExtractionOutputSchema, LearnJobSchema } =
  await import("../src/modules/institution-memory/schemas/memory.schema.js");

const admin = { kind: "admin" as const, id: "9" };
const worker = { kind: "system" as const };
const policy = { type: "INSTITUTION_POLICY" as const, content: "Refunds are discussed only after an offer.", importance: 3, metadata: {} };
const historyOf = (re: RegExp) => bound(re).filter((v): v is string => typeof v === "string" && v.startsWith("[{")).map((v) => JSON.parse(v)[0]);

console.log("\n1. Schemas");
{
  const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => s.safeParse(v).success;
  assert(ok(CreateMemorySchema, { type: "AVOIDANCE_RULE", content: "Never recommend the old diploma." }), "minimal memory valid, defaults filled");
  assert(!ok(CreateMemorySchema, { type: "RESPONSE_PATTERN", content: "Ask level first" }), "RESPONSE_PATTERN needs technique + trigger");
  assert(!ok(CreateMemorySchema, { type: "RESPONSE_PATTERN", content: "Ask level first", metadata: { technique: "hypnotise", trigger: "x" } }), "unknown technique rejected");
  assert(!ok(CreateMemorySchema, { type: "GENERAL_CONTEXT", content: "x".repeat(601) }), "content over 600 rejected");
  assert(!ok(CreateMemorySchema, { type: "GENERAL_CONTEXT", content: "fine", importance: 6 }), "importance 6 rejected");
  assert(!ok(PatchMemorySchema, { type: "AVOIDANCE_RULE" }), "type not patchable (strict)");
  assert(!ok(MemoryRowSchema, { ...row(), source: "hearsay" }), "row with unknown source rejected");
  assert(!ok(MemoryRowSchema, { ...row(), source_reference: { actors: ["not-a-hash"] } }), "actors must be 16-hex hashes");
  assert(!ok(ExtractionOutputSchema, { candidates: [{ type: "GENERAL_CONTEXT", content: "abc", confidence: 0.9 }] }), "extractor output needs mentions_person");
  assert(!ok(LearnJobSchema, { kind: "correction", message_id: 1 }), "learn job needs institution_id");
  assert(ok(LearnJobSchema, { kind: "conversation", institution_id: 5, session_id: 1 }), "conversation job valid");
}

console.log("\n2. Identity");
{
  assert(svc.hashContent("Refunds  within 28 days.") === svc.hashContent("refunds within 28 days"), "hash ignores case, whitespace, trailing punctuation");
  assert(/^[a-f0-9]{16}$/.test(svc.hashActor(42)), "actor hash is 16 hex");
  assert(svc.embedTextFor("AVOIDANCE_RULE", "Never X") === "avoidance rule: Never X", "embedding text carries the type");
}

console.log("\n3. Create: admin → active; learned → candidate; insert names the partial-index predicate");
{
  reset([[INSERT_MEMORY, () => [{ id: ID }]], [SELECT_MEMORY, () => [row()]]]);
  h.embedCalls.length = 0;
  const out = await svc.createMemory({ institutionId: INST, input: policy, source: "admin", actor: admin, createdBy: 9 });
  const ins = find(INSERT_MEMORY);
  assert(out.outcome === "created", "outcome created", out.outcome);
  assert(/on conflict \(content_hash\) WHERE status <> 'deleted' do nothing/i.test(ins?.text ?? ""), "ON CONFLICT carries the partial-index predicate");
  assert(!/institution_id/.test(ins?.text ?? "") && h.tenantRequests[0] === INST, "no institution column: the row went to institution 5's schema");
  assert(ins?.values.includes("active") === true && ins.values.includes(1) && /\$\d::vector/.test(ins.text), "active, confidence 1, vector bound", ins?.values);
  assert(h.embedCalls.length === 1 && h.embedCalls[0].includes("institution policy:"), "one embedding call, typed text");
  assert(historyOf(INSERT_MEMORY)[0]?.event === "created", "history starts with 'created'");

  reset([[INSERT_MEMORY, () => [{ id: ID }]], [SELECT_MEMORY, () => [row({ status: "candidate", source: "extracted" })]]]);
  await svc.createMemory({ institutionId: INST, input: policy, source: "extracted", actor: worker, confidence: 0.95, evidenceActor: HEX(1) });
  const v = find(INSERT_MEMORY)?.values ?? [];
  assert(v.includes("candidate") && !v.includes("active"), "learned → candidate even at 0.95");
  assert(v.some((x) => typeof x === "string" && x.includes(HEX(1))), "evidence actor recorded");
}

console.log("\n4. Repeat of an active statement → ONE atomic reinforce UPDATE with history append");
{
  reset([[INSERT_MEMORY, () => []], [UPDATE_MEMORY, () => [row({ reinforce_count: 1 })]], [SELECT_MEMORY, () => [row()]]]);
  const out = await svc.createMemory({ institutionId: INST, input: policy, source: "extracted", actor: worker, evidenceActor: HEX(2) });
  const u = find(UPDATE_MEMORY)?.text ?? "";
  assert(out.outcome === "reinforced" && !out.promoted, "reinforced, not promoted");
  assert(count(UPDATE_MEMORY) === 1, "exactly one UPDATE");
  assert(/reinforce_count \+ 1/.test(u) && /LEAST\(1, confidence \+ 0\.1\)/.test(u), "count and confidence bumped in SQL");
  assert(/::jsonb\) \? \$\d/.test(u) && /jsonb_set/.test(u), "jsonb membership guards the actor append (literal ? survived knex)");
  assert(/history - 0 ELSE history END\) \|\| \$\d::jsonb/.test(u), "history appended with cap in the same UPDATE");
  assert(historyOf(UPDATE_MEMORY)[0]?.event === "reinforced", "history entry 'reinforced'");
  assert(count(PROMOTE) === 0, "no promotion attempt for an active row");
}

console.log("\n5. Candidate promotion: conditional on distinct students, in SQL");
{
  reset([[INSERT_MEMORY, () => []], [PROMOTE, () => []], [UPDATE_MEMORY, () => [row({ status: "candidate", source: "extracted" })]], [SELECT_MEMORY, () => [row({ status: "candidate", source: "extracted" })]]]);
  let out = await svc.createMemory({ institutionId: INST, input: policy, source: "extracted", actor: worker, evidenceActor: HEX(1) });
  const p = find(PROMOTE);
  assert(out.outcome === "reinforced" && !out.promoted, "not promoted while the predicate fails");
  assert(/jsonb_array_length\(COALESCE\(source_reference->'actors', '\[\]'::jsonb\)\) >= \$\d/.test(p?.text ?? "") && p?.values.includes("candidate") && p.values.includes(svc.PROMOTION_MIN_ACTORS), "guarded by status = candidate AND ≥ N distinct actors", p?.values);
  assert(/"conflicts_with_id" is null/.test(p?.text ?? ""), "…and by conflicts_with_id IS NULL — a contradiction never auto-promotes");

  reset([[INSERT_MEMORY, () => []], [PROMOTE, () => [row({ status: "active", source: "extracted" })]], [UPDATE_MEMORY, () => [row({ status: "candidate", source: "extracted" })]], [SELECT_MEMORY, () => [row({ status: "candidate", source: "extracted" })]]]);
  out = await svc.createMemory({ institutionId: INST, input: policy, source: "extracted", actor: worker, evidenceActor: HEX(3) });
  assert(out.outcome === "reinforced" && out.promoted && out.memory.status === "active", "promoted when the predicate holds");

  // …but a FACT never promotes itself, however much evidence accrues. Same fixtures as the line
  // above — the DB would happily promote it, so the only thing stopping it is the type check in
  // reinforceMemory, which is what this asserts. Behaviour, not set membership: an assertion on
  // NEVER_AUTO_PROMOTES alone stayed green when the guard was deleted.
  const fact = { type: "GENERAL_KNOWLEDGE" as const, content: "Australian student visas generally require proof of funds.", metadata: { topic: "visas" }, importance: 3 };
  reset([
    [INSERT_MEMORY, () => []],
    [PROMOTE, () => [row({ status: "active", source: "extracted", type: "GENERAL_KNOWLEDGE" })]],
    [UPDATE_MEMORY, () => [row({ status: "candidate", source: "extracted", type: "GENERAL_KNOWLEDGE" })]],
    [SELECT_MEMORY, () => [row({ status: "candidate", source: "extracted", type: "GENERAL_KNOWLEDGE" })]],
  ]);
  out = await svc.createMemory({ institutionId: INST, input: fact, source: "extracted", actor: worker, evidenceActor: HEX(3) });
  assert(out.outcome === "reinforced" && !out.promoted && out.memory.status === "candidate",
    "a GENERAL_KNOWLEDGE candidate is reinforced but NEVER promoted by the crowd", out);
  assert(count(PROMOTE) === 0,
    "and the promotion statement is not even attempted — three students hearing the same wrong "
    + "answer is three students misinformed, not three confirmations", count(PROMOTE));
}

console.log("\n6. Human confirms a candidate; human revives a deprecated one; learned repeat of deprecated is rejected");
{
  reset([[INSERT_MEMORY, () => []], [UPDATE_MEMORY, () => [row({ status: "active" })]], [SELECT_MEMORY, () => [row({ status: "candidate", source: "extracted" })]]]);
  const promoted = await svc.createMemory({ institutionId: INST, input: policy, source: "correction", actor: admin });
  assert(promoted.outcome === "promoted" && find(UPDATE_MEMORY)?.values.includes("active"), "candidate promoted by a human");

  reset([[INSERT_MEMORY, () => []], [UPDATE_MEMORY, () => [row({ status: "active", version: 2 })]], [SELECT_MEMORY, () => [row({ status: "deprecated" })]]]);
  const revived = await svc.createMemory({ institutionId: INST, input: policy, source: "admin", actor: admin });
  const u = find(UPDATE_MEMORY);
  assert(revived.outcome === "reactivated" && /version" = version \+ 1/.test(u?.text ?? "") && u?.values.includes("active"), "deprecated + human → reactivated, version bumped");
  assert(historyOf(UPDATE_MEMORY)[0]?.event === "reactivated", "history 'reactivated'");

  reset([[INSERT_MEMORY, () => []], [SELECT_MEMORY, () => [row({ status: "deprecated", source: "extracted" })]]]);
  const rejected = await svc.createMemory({ institutionId: INST, input: policy, source: "extracted", actor: worker });
  assert(rejected.outcome === "rejected" && rejected.reason === "previously_deprecated" && count(UPDATE_MEMORY) === 0, "deprecated + learned → rejected, no write");
}

console.log("\n6b. approve() clears a conflict link; flagConflict stores linked with history");
{
  reset([[SELECT_MEMORY, () => [row({ status: "candidate", source: "extracted", conflicts_with_id: ID2 })]], [UPDATE_MEMORY, () => [row({ status: "active" })]]]);
  await svc.approve(ID, INST, admin);
  const u = find(UPDATE_MEMORY);
  assert(/"conflicts_with_id" = \$\d/.test(u?.text ?? "") && u?.values.includes("active") && u.values.includes(null), "approve sets active and conflicts_with_id = NULL");
  assert(historyOf(UPDATE_MEMORY)[0]?.reason === `approved over ${ID2}`, "history says which memory it was approved over");

  reset([[SELECT_MEMORY, (s) => [row({ id: String(s.values[0]) })]], [INSERT_MEMORY, () => [{ id: ID2 }]]]);
  const flagged = await svc.flagConflict({ institutionId: INST, input: policy, conflictsWithId: ID, confidence: 0.7, actor: worker, embedding: h.vector });
  const ins = find(INSERT_MEMORY);
  assert(!!flagged && /"conflicts_with_id"/.test(ins?.text ?? "") && ins?.values.includes(ID) && ins.values.includes("candidate") && ins.values.includes("extracted"), "flagConflict inserts a linked extracted candidate");
  assert(historyOf(INSERT_MEMORY)[0]?.event === "created" && JSON.parse(String(ins?.values.find((v) => typeof v === "string" && String(v).startsWith("[{"))))[1]?.event === "conflict_flagged", "history: created then conflict_flagged");
}

console.log("\n7. Votes: learned memories can be voted out, human-authored ones only flagged");
{
  const five = [11, 12, 13, 14, 15].map(HEX);
  reset([[/negative_voters/, () => [row({ source: "extracted", source_reference: { actors: [], positive_voters: [], negative_voters: five } })]], [UPDATE_MEMORY, () => [row({ status: "deprecated" })]]]);
  let out = await svc.voteOnMemory(ID, INST, "negative", HEX(15));
  assert(out === "deprecated" && all(UPDATE_MEMORY)[1]?.values.includes("deprecated"), "5 negatives, 0 positives → learned memory deprecated");
  assert(/NOT \(COALESCE\(source_reference->'negative_voters', '\[\]'::jsonb\) \? \$\d\)/.test(find(/negative_voters/)?.text ?? ""), "vote UPDATE refuses a repeat voter in SQL");

  reset([[/negative_voters/, () => [row({ source: "admin", source_reference: { actors: [], positive_voters: [], negative_voters: five } })]], [UPDATE_MEMORY, () => [row({ flagged_at: new Date() })]]]);
  out = await svc.voteOnMemory(ID, INST, "negative", HEX(15));
  const flag = all(UPDATE_MEMORY)[1];
  assert(out === "flagged" && /"flagged_at"/.test(flag?.text ?? "") && !flag?.values.includes("deprecated"), "admin memory flagged, status untouched");

  reset([[/negative_voters/, () => []]]);
  assert((await svc.voteOnMemory(ID, INST, "negative", HEX(15))) === "duplicate" && count(UPDATE_MEMORY) === 1, "repeat vote is a duplicate");

  reset([[/negative_voters/, () => [row({ source: "extracted", source_reference: { actors: [], positive_voters: [HEX(1)], negative_voters: five } })]]]);
  assert((await svc.voteOnMemory(ID, INST, "negative", HEX(15))) === "counted" && count(UPDATE_MEMORY) === 1, "one positive vote blocks vote-driven deprecation");

  // Feedback can be changed on a message. A thumb that flips direction must MOVE the actor, or
  // they sit in both arrays and their stale positive blocks the deprecation their negative asked for.
  reset([[/negative_voters/, () => [row({ source: "extracted" })]]]);
  await svc.voteOnMemory(ID, INST, "negative", HEX(7));
  assert(/source_reference->'positive_voters'[^)]*\) - \$/.test(find(/negative_voters/)?.text ?? ""), "a negative vote drops the actor from positive_voters", find(/negative_voters/)?.text);

  // A widget visitor's hash comes from a fingerprint they control, so five of them is one
  // person five times over. Their votes flag for review; they never retire the guidance.
  reset([[/negative_voters/, () => [row({ source: "extracted", source_reference: { actors: [], positive_voters: [], negative_voters: five } })]], [UPDATE_MEMORY, () => [row({ flagged_at: new Date() })]]]);
  out = await svc.voteOnMemory(ID, INST, "negative", HEX(15), { anonymous: true });
  const anon = all(UPDATE_MEMORY)[1];
  assert(out === "flagged" && /"flagged_at"/.test(anon?.text ?? "") && !anon?.values.includes("deprecated"), "5 anonymous negatives on a learned memory → flagged, never deprecated");
}

console.log("\n7b. Array caps: writers trim at the cap, reads never reject what is already stored");
{
  // A popular memory used to grow past the schema's caps, and then every read of it threw —
  // including the list read, which parses every row, so one hot memory took out the whole page.
  const over = Array.from({ length: 51 }, (_, i) => HEX(100 + i));
  reset([[SELECT_MEMORY, () => [row({ source_reference: { actors: [], positive_voters: [], negative_voters: over } })]]]);
  let read: unknown;
  try { read = await repo.findById(ID, INST); } catch { read = "threw"; }
  assert(read !== "threw" && !!read, "a row already past the voter cap still reads", read);

  const full = Array.from({ length: 20 }, (_, i) => HEX(200 + i));
  reset([[UPDATE_MEMORY, () => [row({ source_reference: { actors: full, positive_voters: [], negative_voters: [] } })]]]);
  await repo.reinforce(ID, INST, HEX(999), { at: new Date().toISOString(), event: "reinforced", by: { kind: "student" } });
  assert(/jsonb_array_length\(COALESCE\(source_reference->'actors'[^)]*\)[^)]*\) >= 20/.test(find(UPDATE_MEMORY)?.text ?? ""), "reinforce trims the oldest actor at the cap", find(UPDATE_MEMORY)?.text);

  reset([[/negative_voters/, () => [row({ source: "admin" })]]]);
  await svc.voteOnMemory(ID, INST, "negative", HEX(999));
  assert(/jsonb_array_length\(COALESCE\(source_reference->'negative_voters'[^)]*\)[^)]*\) >= 50/.test(find(/negative_voters/)?.text ?? ""), "vote trims the oldest voter at the cap", find(/negative_voters/)?.text);
}

console.log("\n8. Edit re-validates metadata against the row's type and re-embeds on content change");
{
  reset([[SELECT_MEMORY, () => [row({ type: "RESPONSE_PATTERN", metadata: { technique: "clarify_first", trigger: "x" } })]], [UPDATE_MEMORY, () => [row({ type: "RESPONSE_PATTERN" })]]]);
  let threw = false;
  try { await svc.edit(ID, INST, { metadata: { technique: "nope", trigger: "x" } }, admin); } catch { threw = true; }
  assert(threw && count(UPDATE_MEMORY) === 0, "bad technique for a RESPONSE_PATTERN → ZodError, no write");
  h.embedCalls.length = 0;
  await svc.edit(ID, INST, { content: "Ask their study level before listing scholarships." }, admin);
  const u = find(UPDATE_MEMORY);
  assert(/version" = version \+ 1/.test(u?.text ?? "") && /\$\d::vector/.test(u?.text ?? "") && h.embedCalls.length === 1, "content edit bumps version and re-embeds");
}

console.log("\n9. touchUsed, sweep, match, pinned");
{
  reset([]);
  await repo.touchUsed([ID, ID2], INST);
  assert(count(UPDATE_MEMORY) === 1 && /"id" in \(\$1, \$2\)/.test(find(UPDATE_MEMORY)?.text ?? ""), "touchUsed: one UPDATE for all ids");
  await repo.touchUsed([], INST);
  assert(count(UPDATE_MEMORY) === 1, "touchUsed with no ids issues nothing");

  reset([[/from "institutions"/, () => [{ id: INST }, { id: h.OTHER_INST }]], [/"expires_at" <= /, () => [{}]], [/INTERVAL '1 day'/, () => [{}, {}]]]);
  const sweep = await svc.runSweep();
  assert(sweep.institutions === 2 && sweep.expired === 2 && sweep.stale === 4, "sweep walks every provisioned institution's schema", sweep);
  assert(h.tenantRequests.join() === `${INST},${INST},${h.OTHER_INST},${h.OTHER_INST}`, "each institution resolved for its own two sweep statements", h.tenantRequests);
  assert(bound(/INTERVAL '1 day'/).includes(svc.CANDIDATE_TTL_DAYS), "candidate TTL is a binding");

  reset([[MATCH_FN, () => []]]);
  await repo.match(h.vector, INST, { count: 6, types: ["AVOIDANCE_RULE"] });
  const call = find(MATCH_FN);
  assert(/\(\$1::vector, \$2, \$3, \$4\)/.test(call?.text ?? "") && call?.values[1] === 6 && h.tenantRequests[0] === INST, "function called unqualified inside the institution's schema, count second");
  reset([]);
  await repo.pinned(INST);
  const pinnedSql = find(/from "institution_ai_memories"/);
  assert(!/institution_id/.test(pinnedSql?.text ?? "") && pinnedSql?.values.includes("active"),
    "pinned query: active rows, no institution column — the schema is the boundary", pinnedSql?.text);

  // The always-on predicate is ONE string shared by pinned() and counts(). Asserted as the same
  // text in both because the header's "N on every reply" and the rules actually carried into a
  // reply are the same claim: a rule enforced at one end and not the other is this module's
  // whole defect history.
  const alwaysOn = /AVOIDANCE_RULE.*RESPONSE_PREFERENCE.*COUNSELLING_GUIDELINE.*importance = 5/s;
  assert(alwaysOn.test(pinnedSql?.text ?? "") && /expires_at IS NULL OR expires_at > now\(\)/.test(pinnedSql?.text ?? ""),
    "…and carries the always-on predicate, expiry included", pinnedSql?.text);

  reset([[/count\(\*\) FILTER/, () => [{ active: "4", candidate: "2", conflicting: "1", flagged: "1", always_on: "3", needs_you: "3" }]]]);
  const counts = await repo.counts(INST);
  const countSql = find(/count\(\*\) FILTER/);
  assert(counts.active === 4 && counts.alwaysOn === 3 && counts.needsYou === 3,
    "counts(): Postgres returns count() as a string; every figure is a number", counts);
  assert(alwaysOn.test(countSql?.text ?? ""), "counts() uses the SAME always-on predicate as pinned()");
  assert(/status <> 'deleted'/.test(countSql?.text ?? "") && !/limit/i.test(countSql?.text ?? ""),
    "…counts every live row, with no limit — a capped list is what it replaces", countSql?.text);
  // needs_you is counted per ROW, not as flagged + conflicting + candidate, which would count a
  // flagged candidate twice. Mirrors needsDecision() in the portal's utils.
  assert(/FILTER \(WHERE status = 'candidate'\s+OR conflicts_with_id IS NOT NULL\s+OR flagged_at IS NOT NULL\)/.test(countSql?.text ?? ""),
    "…and needs_you is ONE per-row predicate, never a sum of three counters", countSql?.text);
}

console.log("\n9b. The header's figures are COUNTED, never summed from a page");
{
  const learnRepo = await import("../src/modules/institution-memory/repositories/learning.repository.js");
  reset([[/count\(\*\)/i, () => [{ c: "7" }]]]);
  const n = await learnRepo.countUnreviewedReplies([3, 9]);
  const sql = find(/count\(\*\)/i);
  assert(n === 7, "countUnreviewedReplies: a string count becomes a number", n);
  assert(/"m"\."review_status" is null/.test(sql?.text ?? "") && /"m"\."role" = \$/.test(sql?.text ?? ""),
    "…the same predicate the per-session subquery uses", sql?.text);
  // Every session of every widget the institution owns. The cap this replaces was in the portal,
  // which summed one 50-session page client-side; there is no backend assertion that can catch
  // that, so what is pinned here is that the figure it reads instead is a real count.
  assert(/"s"\."embed_config_id" in \(\$\d, \$\d\)/.test(sql?.text ?? ""),
    "…over every session of the institution's widgets", sql?.text);
  assert(await learnRepo.countUnreviewedReplies([]) === 0 && count(/count\(\*\)/i) === 1,
    "an institution with no widgets asks nothing");
}

console.log("\n12. Query flags and deleted rows");
{
  const { MemoryQuerySchema } = await import("../src/modules/institution-memory/schemas/memory.schema.js");
  // z.coerce.boolean() turned every non-empty string into true, so ?flagged=false filtered to flagged.
  const q = MemoryQuerySchema.parse({ flagged: "false", conflicting: "true" });
  assert(q.flagged === false && q.conflicting === true, "?flagged=false parses as false, ?conflicting=true as true", q);
  // Two kinds of caller: HTTP hands it strings, internal code (scripts/, tests/) hands it real
  // booleans. String-only rejected the latter with "Expected 'true' | 'false', received boolean",
  // which broke tests/institution-memory-dry-run.ts:122.
  const qb = MemoryQuerySchema.parse({ flagged: false, conflicting: true });
  assert(qb.flagged === false && qb.conflicting === true, "a real boolean from an internal caller parses too", qb);
  for (const junk of [{ flagged: "yes" }, { flagged: 1 }, { flagged: "" }]) {
    let threw = false;
    try { MemoryQuerySchema.parse(junk); } catch { threw = true; }
    assert(threw, `junk is still rejected, not silently coerced: ${JSON.stringify(junk)}`);
  }

  // A deleted row is not found to any action, as it is to GET — deprecating it would revive it
  // into a dedupe slot a re-created statement may already hold.
  reset([[SELECT_MEMORY, () => [row({ status: "deleted" })]], [UPDATE_MEMORY, () => [row({ status: "deprecated" })]]]);
  const err = await svc.deprecate(ID, INST, admin, "stale").then(() => null, (e: Error) => e);
  assert(err?.name === "NotFoundError" && count(UPDATE_MEMORY) === 0, "deprecate on a deleted memory → NotFound, no write", err?.message);
}

await h.finish();
