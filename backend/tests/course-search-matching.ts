/**
 * How a course query is matched. "water engineering" used to return the one water course and then
 * pad the page with everything whose name merely said "engineering" — ranking cannot fix that,
 * because rank only ORDERS rows the WHERE already let in, and the limit fills up first.
 *
 * Asserts the generated SQL, so there is no DB and no fixture: knex builds offline via toSQL().
 * Run: npm run test:course-search-matching
 */
import assert from "node:assert/strict";
import { masterKnex } from "../src/core/db/master-pool.js";
import { anyKeywordILike, everyKeywordILike, levelPatterns } from "../src/modules/ai-counsellor/repositories/knowledge.repository.js";

const COLUMNS = ["c.name", "c.subject_area"];
const sqlFor = (where: ReturnType<typeof anyKeywordILike>) =>
  masterKnex.queryBuilder().from("x").where(where).toSQL().sql.toLowerCase();

const loose = sqlFor(anyKeywordILike(COLUMNS, "water engineering"));
const strict = sqlFor(everyKeywordILike(COLUMNS, "water engineering"));

// Loose: one flat OR — any word in any column is enough, which is the padding.
assert.ok(!loose.includes(" and "), `loose matching must not AND anything: ${loose}`);
assert.equal((loose.match(/ilike/g) ?? []).length, 4, "two words x two columns");

// Strict: one group per WORD, ANDed; the columns inside a group stay ORed, so a word may match
// the name or the subject — but every word must match something.
assert.ok(strict.includes(" and "), `strict matching must AND the words: ${strict}`);
assert.equal((strict.match(/ilike/g) ?? []).length, 4, "same four comparisons, grouped differently");
assert.equal((strict.match(/\(/g) ?? []).length, (loose.match(/\(/g) ?? []).length + 2, "one bracket pair per word");

// One word is identical under both — there is nothing to AND, so widening it would be a no-op.
assert.equal(sqlFor(everyKeywordILike(COLUMNS, "nursing")).replace(/[()]/g, ""),
  sqlFor(anyKeywordILike(COLUMNS, "nursing")).replace(/[()]/g, ""), "a single word matches the same either way");

// Browse mode: no words, no predicate — the filters (level, country, job scope) carry the query.
assert.ok(!sqlFor(everyKeywordILike(COLUMNS, "")).includes("ilike"), "empty query adds no matching");

// degree_level is free text with 28 spellings of five levels, and degree_level_code is populated on
// 1,130 of 19,088 rows — so a requested level has to expand to every spelling that level is stored as.
assert.deepEqual(levelPatterns("Doctoral"), ["doctoral", "doctorate", "phd"], "a doctorate is stored four ways");
assert.deepEqual(levelPatterns("PhD"), ["doctoral", "doctorate", "phd"], "however the caller words it");
// The tool path passes whatever word the model picked, so it goes through the same table.
assert.deepEqual(levelPatterns("Doctorate"), ["doctoral", "doctorate", "phd"]);
// A certificate must never resolve to diplomas — that hid 213 rows and returned 151 unrelated ones.
assert.deepEqual(levelPatterns("Certificate"), ["certificate"]);
assert.deepEqual(levelPatterns("Diploma"), ["diploma"]);
// A qualified level is a level of its OWN — the extractor writes Certificate, Graduate Certificate,
// Diploma, Advanced Diploma and Graduate Diploma as five distinct degree_level values. Widening one
// to the bare level let ordinary diplomas fill the limit ahead of the graduate diplomas asked for.
assert.deepEqual(levelPatterns("Graduate Certificate"), ["graduate certificate", "postgraduate certificate"]);
assert.deepEqual(levelPatterns("Postgraduate Diploma"), ["graduate diploma", "postgraduate diploma"]);
assert.deepEqual(levelPatterns("Advanced Diploma"), ["advanced diploma", "advance diploma"]);
for (const qualified of ["Graduate Diploma", "Advanced Diploma"]) {
  assert.ok(!levelPatterns(qualified).includes("diploma"), `${qualified} must not widen to every diploma`);
}
assert.ok(!levelPatterns("Certificate").includes("diploma"), "certificate is not a diploma");
// "Post-Doctoral Certificate" is a doctorate, and the doctoral rule claims it first.
assert.deepEqual(levelPatterns("Post-Doctoral Certificate"), ["doctoral", "doctorate", "phd"]);
// Anything unrecognised is matched as written rather than silently dropped.
assert.deepEqual(levelPatterns("Associate Degree"), ["Associate Degree"]);

console.log("course-search-matching: ok");
await masterKnex.destroy();
