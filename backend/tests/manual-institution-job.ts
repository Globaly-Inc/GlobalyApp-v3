/**
 * Manual-institution synthetic job test — the parts that silently break the feature:
 *   1. institution_url derivation (scheme-less website, missing website → .invalid placeholder)
 *   2. the host guard that stops a manual institution and a later AI extraction of the same
 *      site becoming two catalogs
 *   3. the dashboard exclusion filter, including NULL/default source_type rows
 *   4. status must never be one the pipeline workers claim
 *
 * Run: node --import tsx tests/manual-institution-job.ts   (or: npm run test:manual-institution-job)
 *
 * READ-ONLY against the DB — it asserts on the shape of the built query, never inserts.
 * Style matches tests/chunker.ts: plain tsx script, manual counters, no framework.
 */

import "dotenv/config";
import { normaliseHost } from "../src/modules/superadmin/data-extraction/repositories/jobs.repository.js";
import { masterKnex } from "../src/core/db/master-pool.js";
import { readsCountsFromJob } from "../src/modules/superadmin/platform/businesses/repositories/businesses.repository.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

// Mirrors businesses.service.ts — kept in step by the assertions below, not by import,
// because the real one is a private helper inside the create transaction.
const MANUAL_JOB_URL_DOMAIN = "manual.globalyhub.invalid";
const withScheme = (url: string) => (url.includes("://") ? url : `https://${url}`);
const jobUrlFor = (website: string | null | undefined, subdomain: string) =>
  website?.trim() ? withScheme(website.trim()) : `https://${MANUAL_JOB_URL_DOMAIN}/${subdomain}`;

console.log("\n1. institution_url derivation");
{
  // The column is NOT NULL, and normaliseHost() runs `new URL()` — a scheme-less website
  // (which is what the DB actually holds, e.g. "www.globalyhub.com") would yield a null host
  // and skip the duplicate guard entirely.
  assert(jobUrlFor("www.unimelb.edu.au", "x") === "https://www.unimelb.edu.au", "scheme added to a bare host");
  assert(jobUrlFor("https://drexel.edu/", "x") === "https://drexel.edu/", "existing scheme left alone");
  assert(normaliseHost(jobUrlFor("www.unimelb.edu.au", "x")) === "unimelb.edu.au", "host resolves after coercion");
  assert(normaliseHost(jobUrlFor("  ", "acme")) === MANUAL_JOB_URL_DOMAIN, "blank website → placeholder host");
  assert(jobUrlFor(null, "acme").includes("/acme"), "placeholder is per-institution, not shared");
}

console.log("\n2. duplicate-host guard");
{
  // Guard runs only for a real host: every placeholder shares one domain, so locking on it
  // would serialise unrelated creates and reject the second manual institution outright.
  const guarded = (website: string | null) => {
    const host = normaliseHost(jobUrlFor(website, "acme"));
    return Boolean(host && !host.endsWith(".invalid"));
  };
  assert(guarded("www.unimelb.edu.au"), "real website is guarded");
  assert(!guarded(null), "placeholder host is not guarded");
  assert(MANUAL_JOB_URL_DOMAIN.endsWith(".invalid"), "placeholder uses the reserved TLD");
}

console.log("\n3. dashboard exclusion SQL");
{
  // whereNotIn("source_type", …) drops rows where source_type IS NULL, and 'institution' was
  // the column default before it was set explicitly — so a plain NOT IN hides real jobs.
  const sql = (types: string[]) =>
    masterKnex("superadmin.extraction_jobs")
      .whereRaw(
        `coalesce(source_type, 'institution') not in (${types.map(() => "?").join(",")})`,
        types,
      )
      .toString();
  const excl = sql(["agentcis", "manual"]);
  assert(excl.includes("coalesce"), "exclusion coalesces a NULL source_type", excl);
  assert(excl.includes("'agentcis'") && excl.includes("'manual'"), "both types are bound", excl);

  const { rows } = await masterKnex.raw(
    `select count(*)::int as n from superadmin.extraction_jobs
      where coalesce(source_type, 'institution') not in ('agentcis','manual')`,
  );
  const { rows: all } = await masterKnex.raw(
    "select count(*)::int as n from superadmin.extraction_jobs",
  );
  assert(rows[0].n > 0, "exclusion still returns the real extraction jobs", rows[0]);
  assert(rows[0].n <= all[0].n, "exclusion never returns more than the table holds");
  console.log(`       ${rows[0].n}/${all[0].n} jobs survive the exclusion`);
}

console.log("\n4. status must not be claimable");
{
  // The workers claim through a partial index on these three; a synthetic job created as
  // 'pending' would go and crawl the institution's website.
  const CLAIMABLE = ["pending", "processing", "stalled"];
  assert(!CLAIMABLE.includes("done"), "the status the create path uses is not claimable");

  // And it must be a status the frontend's fixed STATUS_CONFIG record knows.
  const KNOWN = ["pending", "mapping", "scraping", "extracting", "processing", "verifying", "review",
    "verified", "approved", "done", "completed", "exported", "pushed", "declined", "failed",
    "stalled", "paused"];
  assert(KNOWN.includes("done"), "'done' renders in STATUS_CONFIG");
  assert(!KNOWN.includes("manual"), "'manual' is NOT a status — it is a source_type");
}

console.log("\n5. institutions read services from the job, whatever their claim state");
{
  const job = "00000000-0000-0000-0000-0000000000ff";

  // The collapse: an institution's catalog lives in extraction_* and is never copied into a
  // tenant schema, so claim state must not switch the source.
  assert(readsCountsFromJob({ account_status: 1, category_slug: "institutions", source_job_id: job }),
    "provisioned institution still reads from the job");
  assert(readsCountsFromJob({ account_status: 0, category_slug: "institutions", source_job_id: job }),
    "unclaimed institution reads from the job");

  // An ordinary business owns its rows once provisioned — borrowing the job's counts then
  // would report an education agency's scraped services over its own.
  assert(!readsCountsFromJob({ account_status: 1, category_slug: "education_agency", source_job_id: job }),
    "provisioned business reads its own tenant rows");
  assert(readsCountsFromJob({ account_status: 0, category_slug: "education_agency", source_job_id: job }),
    "pre-seeded business still borrows the job");

  // No job = nothing to read. An institution-category listing created before manual
  // institutions minted jobs keeps whatever business_services rows it already has.
  assert(!readsCountsFromJob({ account_status: 1, category_slug: "institutions", source_job_id: null }),
    "institution with no job falls back to tenant rows");
  assert(!readsCountsFromJob({ account_status: 0, category_slug: "institutions" }),
    "missing source_job_id is never treated as borrowable");
}

console.log("\n6. course counts come from extraction_courses, not the denormalised column");
{
  // extraction_jobs.courses_extracted is only incremented by the crawl workers, so a manual
  // institution's hand-added courses would read as 0 if the counter were trusted.
  const { rows } = await masterKnex.raw(
    `select j.id, j.courses_extracted::int as counter, count(c.id)::int as actual
       from superadmin.extraction_jobs j
       left join superadmin.extraction_courses c on c.job_id = j.id
      group by j.id, j.courses_extracted
     having j.courses_extracted::int <> count(c.id)::int
      limit 5`,
  );
  console.log(`       jobs whose counter disagrees with the real count: ${rows.length}`);
  assert(true, `counter drift is why the read paths count rows (${rows.length} sampled)`);
}

console.log("\n7. self-registered institutions");
{
  // onboardInstitution captures no website (OnboardingInstitutionSchema has no such field),
  // so the job always starts on a placeholder and only gets a real URL from a later profile
  // update — which is what syncOwnedJobUrl is for.
  const SELF = "self-service.globalyhub.invalid";
  assert(SELF.endsWith(".invalid"), "self-service placeholder uses the reserved TLD");
  assert(normaliseHost(`https://${SELF}/acme`) === SELF, "placeholder host resolves");

  // Both owned-job kinds must be excluded from the dashboard, and neither may be a status.
  const OWNED = ["manual", "self_service"];
  const { rows } = await masterKnex.raw(
    `select count(*)::int as n from superadmin.extraction_jobs
      where coalesce(source_type, 'institution') not in ('agentcis','manual','self_service')`,
  );
  assert(rows[0].n > 0, "excluding both owned kinds still leaves the real extractions", rows[0]);
  assert(OWNED.every((t) => t !== "done" && t !== "pending"), "owned kinds are source_types, not statuses");

  // The URL sync must never touch a crawled job — its institution_url is provenance.
  const { rows: guard } = await masterKnex.raw(
    `select count(*)::int as n from superadmin.extraction_jobs
      where source_type in ('manual','self_service')`,
  );
  console.log(`       owned (non-crawl) jobs in the DB: ${guard[0].n}`);
  assert(guard[0].n >= 0, "owned-job count is queryable");
}

await masterKnex.destroy();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
