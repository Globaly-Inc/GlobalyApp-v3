// Check on promote's table routing — the one decision that decides whether a row lands in
// `institutions` or `businesses`. Getting it wrong is silent and only visible once thousands
// of rows are in the wrong table, which is the whole reason the two tables are separate.
//
// Run with: npm run test:promote-routing
//
// Hits the real DB (read-only): it resolves the 'institutions' business category by slug, the
// same way promote does, so a reseeded or renumbered categories table fails this instead of
// misfiling data.

import "dotenv/config";
import assert from "node:assert/strict";
import { masterKnex } from "../src/core/db/master-pool.js";
import { isInstitutionCategory } from "../src/modules/superadmin/data-extraction/repositories/promote.repository.js";

async function main() {
  const categories = await masterKnex("business_categories").whereNull("deleted_at").select("id", "slug");
  const institutions = categories.filter((c) => c.slug === "institutions");

  assert.equal(
    institutions.length,
    1,
    `expected exactly one 'institutions' business category, found ${institutions.length}. ` +
      "Promote routes on this slug, so zero would send every listing to `businesses` and two would be ambiguous.",
  );

  // The category that means institution routes to `institutions`...
  assert.equal(await isInstitutionCategory(Number(institutions[0].id)), true);

  // ...and every other category must not. This is the case the old source_type check got
  // wrong: education_agency / accreditation_body were being filed as institutions.
  for (const other of categories.filter((c) => c.slug !== "institutions")) {
    assert.equal(
      await isInstitutionCategory(Number(other.id)),
      false,
      `category '${other.slug}' (id ${other.id}) must route to businesses, not institutions`,
    );
  }

  // An id that doesn't exist must not be treated as an institution — a stale category id on
  // an old job should fall to businesses, never silently become an institution.
  const maxId = Math.max(...categories.map((c) => Number(c.id)));
  assert.equal(await isInstitutionCategory(maxId + 1000), false);

  console.log(
    `ok — 'institutions' is category id ${institutions[0].id}; ` +
      `${categories.length - 1} other categories route to businesses`,
  );
  await masterKnex.destroy();
}

main().catch(async (err) => {
  console.error("FAILED:", (err as Error).message);
  await masterKnex.destroy();
  process.exit(1);
});
