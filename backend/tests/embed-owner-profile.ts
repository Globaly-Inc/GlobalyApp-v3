/**
 * An embed widget must be able to talk about its OWN institution, and about no other.
 * `ownerProfileByJobs` is the whole boundary: it is the one retriever embed mode does not
 * suppress, so a missing scope guard here would hand every institution's profile — phone
 * and email included — to any widget on the internet.
 * Run: node --import tsx tests/embed-owner-profile.ts
 */
import * as knowledge from "../src/modules/ai-counsellor/repositories/knowledge.repository.js";
import { masterKnex } from "../src/core/db/master-pool.js";

let failed = 0;
function assert(ok: boolean, label: string) {
  if (ok) return;
  failed++;
  console.error(`FAIL: ${label}`);
}

async function main() {
  // An empty scope is the "no match" case (a business whose website matches no job, or an
  // institution with no extraction job). It must return nothing, NEVER an unfiltered read.
  const empty = await knowledge.ownerProfileByJobs([]);
  assert(empty.overview.length === 0, "empty scope returns no overview");
  assert(empty.campuses.length === 0, "empty scope returns no campuses");
  assert(empty.accreditations.length === 0, "empty scope returns no accreditations");

  const jobs = await masterKnex("superadmin.extraction_institution_overview")
    .distinct("job_id")
    .limit(2);

  if (jobs.length === 0) {
    console.log("SKIP — no extracted institution overviews in this database");
  } else {
    const own = await knowledge.ownerProfileByJobs([jobs[0].job_id]);
    assert(own.overview.length > 0, "a scoped lookup finds the owner's own overview");
    assert(
      own.overview.every((r) => r.job_id === jobs[0].job_id),
      "a scoped lookup returns ONLY the owner's own overview",
    );

    if (jobs.length === 2) {
      const other = await knowledge.ownerProfileByJobs([jobs[1].job_id]);
      const overlap = own.overview.some((a) => other.overview.some((b) => a.id === b.id));
      assert(!overlap, "two owners' profiles never overlap");
    }
  }

  console.log(failed === 0 ? "PASS — owner profile is scoped to the widget's own jobs" : `${failed} failure(s)`);
  await masterKnex.destroy();
  process.exit(failed === 0 ? 0 : 1);
}

main();
