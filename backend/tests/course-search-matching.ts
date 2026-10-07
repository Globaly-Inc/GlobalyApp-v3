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
import { anyKeywordILike, everyKeywordILike } from "../src/modules/ai-counsellor/repositories/knowledge.repository.js";

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

console.log("course-search-matching: ok");
await masterKnex.destroy();
