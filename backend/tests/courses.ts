/**
 * Courses listing tests — service-level against the real dev DB.
 * Run: node --import tsx tests/courses.ts
 *
 * Calls the service directly (same rationale as tests/enquiries/*.ts: the route
 * is a thin parse-then-delegate, so this covers its behavior without JWT plumbing).
 */

import { masterKnex } from "../src/core/db/master-pool.js";
import * as coursesService from "../src/modules/courses/services/courses.service.js";

let passed = 0;
let failed = 0;

async function assert(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.stack ?? err.message}`);
  }
}

function eq(actual: unknown, expected: unknown, label = "") {
  if (actual !== expected) {
    throw new Error(`${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function main() {
  console.log("Courses listing tests (DB integration)\n");

  const [{ count }] = await masterKnex("superadmin.extraction_courses").count("id as count");
  const dbTotal = Number(count);

  await assert("lists courses with correct meta.total and required fields", async () => {
    const res = await coursesService.listCourses({ page: 1, limit: 20 });
    eq(res.meta.total, dbTotal, "meta.total");
    eq(res.meta.page, 1, "meta.page");
    eq(res.meta.limit, 20, "meta.limit");
    eq(res.data.length, Math.min(20, dbTotal), "returned row count");
    for (const row of res.data) {
      if (!row.id) throw new Error("row missing id");
      if (!row.name) throw new Error(`row ${row.id} missing name`);
    }
  });

  await assert("pagination: page 2 is disjoint from page 1", async () => {
    const p1 = await coursesService.listCourses({ page: 1, limit: 5 });
    const p2 = await coursesService.listCourses({ page: 2, limit: 5 });
    eq(p1.data.length, 5, "page 1 size");
    eq(p2.data.length, 5, "page 2 size");
    const p1Ids = new Set(p1.data.map((r) => r.id));
    const overlap = p2.data.filter((r) => p1Ids.has(r.id));
    eq(overlap.length, 0, "overlap between pages");
  });

  await assert("ordering is stable by name ascending", async () => {
    const res = await coursesService.listCourses({ page: 1, limit: 100 });
    const names = res.data.map((r) => r.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    eq(JSON.stringify(names), JSON.stringify(sorted), "names sorted");
  });

  await assert("institution_name is joined for at least one course", async () => {
    const res = await coursesService.listCourses({ page: 1, limit: 100 });
    const withInstitution = res.data.filter((r) => r.institution_name);
    if (withInstitution.length === 0) {
      throw new Error("expected the extraction_institution_overview join to populate at least one institution_name");
    }
  });

  await assert("join does not duplicate courses", async () => {
    const res = await coursesService.listCourses({ page: 1, limit: 100 });
    const ids = res.data.map((r) => r.id);
    eq(new Set(ids).size, ids.length, "distinct ids");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await masterKnex.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main();
