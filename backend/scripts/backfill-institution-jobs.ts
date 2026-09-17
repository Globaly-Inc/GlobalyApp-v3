/**
 * Give every institution a source_job_id, so its course catalog has somewhere to live.
 *
 * An institution's services ARE extraction_courses keyed on job_id (see promote.service's
 * header). Institutions created before the create paths started minting their own job have
 * source_job_id NULL and cannot hold a single course. This repairs them.
 *
 * Two outcomes per institution, in this order:
 *   LINK  — its website already has an extraction job. Preferred by far: the institution
 *           inherits a real, already-extracted catalog instead of an empty container.
 *   MINT  — no job matches. Creates the same synthetic row the create paths do
 *           (status "done", so no worker ever claims it). Opt-in via --mint.
 *
 * DRY RUN BY DEFAULT — prints the plan and writes nothing. Pass --apply to commit.
 * Rerunnable: only touches rows where source_job_id IS NULL.
 *
 *   npm run institutions:backfill-jobs                     # plan only
 *   npm run institutions:backfill-jobs -- --apply          # link what can be linked
 *   npm run institutions:backfill-jobs -- --apply --mint   # …and mint for the rest
 *   npm run institutions:backfill-jobs -- --apply --ids 5  # just institution 5
 *   npm run institutions:backfill-jobs -- --apply --allow-shared
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import {
  findJobByInstitutionHost,
  insertJob,
  normaliseHost,
} from "../src/modules/superadmin/data-extraction/repositories/jobs.repository.js";
import { findCategoryIdBySlug } from "../src/modules/superadmin/data-extraction/repositories/promote.repository.js";

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const APPLY = has("--apply");
const MINT = has("--mint");
const ALLOW_SHARED = has("--allow-shared");
const idsFlag = argv.indexOf("--ids");
const ONLY_IDS =
  idsFlag === -1 ? null : new Set((argv[idsFlag + 1] ?? "").split(",").map((s) => Number(s.trim())).filter(Boolean));

/** Same reserved-TLD placeholders the create paths use — unroutable, and never host-matchable. */
const PLACEHOLDER_DOMAIN = { self_service: "self-service.globalyhub.invalid", manual: "manual.globalyhub.invalid" };

const withScheme = (url: string) => (url.includes("://") ? url : `https://${url}`);

type Institution = {
  id: number;
  institution_name: string | null;
  website: string | null;
  subdomain: string | null;
  claim_status: string | null;
};

/** A job already serving another listing — pointing a second one at it makes both render the
 *  same catalog, which is the "two listings, one catalog" mistake in reverse. */
async function jobOwner(jobId: string, excludeInstitutionId: number) {
  const [inst, biz] = await Promise.all([
    masterKnex("institutions")
      .where({ source_job_id: jobId })
      .whereNot({ id: excludeInstitutionId })
      .whereNull("deleted_at")
      .first("id", "institution_name"),
    masterKnex("businesses").where({ source_job_id: jobId }).whereNull("deleted_at").first("id", "business_name"),
  ]);
  return inst ? `institution ${inst.id}` : biz ? `business ${biz.id}` : null;
}

async function courseCount(jobId: string) {
  const [{ count }] = await masterKnex("superadmin.extraction_courses").where({ job_id: jobId }).count("id as count");
  return Number(count);
}

const institutions: Institution[] = await masterKnex("institutions")
  .whereNull("deleted_at")
  .whereNull("source_job_id")
  .select("id", "institution_name", "website", "subdomain", "claim_status")
  .orderBy("id");

const targets = ONLY_IDS ? institutions.filter((i) => ONLY_IDS.has(i.id)) : institutions;

console.log(
  `${targets.length} institution(s) with no source_job_id` +
    (ONLY_IDS ? ` (filtered from ${institutions.length})` : "") +
    (APPLY ? "" : " — DRY RUN, nothing will be written"),
);

const tally = { linked: 0, minted: 0, sharedSkipped: 0, mintSkipped: 0 };

for (const inst of targets) {
  const name = (inst.institution_name ?? `#${inst.id}`).slice(0, 40);
  const url = inst.website?.trim() ? withScheme(inst.website.trim()) : null;
  const host = url ? normaliseHost(url) : null;

  // ── LINK: an extraction of this institution's own site already exists ──
  const existing = host ? await findJobByInstitutionHost(url!) : null;
  if (existing) {
    const owner = await jobOwner(existing.id, inst.id);
    if (owner && !ALLOW_SHARED) {
      tally.sharedSkipped++;
      console.log(`  skip  ${inst.id} ${name} — job for ${host} already serves ${owner} (--allow-shared to link anyway)`);
      continue;
    }
    const courses = await courseCount(existing.id);
    console.log(`  link  ${inst.id} ${name} → job ${existing.id} (${host}, ${courses} courses)${owner ? ` [shared with ${owner}]` : ""}`);
    if (APPLY) {
      await masterKnex("institutions").where({ id: inst.id }).update({ source_job_id: existing.id, updated_at: masterKnex.fn.now() });
    }
    tally.linked++;
    continue;
  }

  // ── MINT: nothing to inherit, so give it an empty container of its own ──
  if (!MINT) {
    tally.mintSkipped++;
    console.log(`  skip  ${inst.id} ${name} — no job for ${host ?? "(no website)"} (pass --mint to create one)`);
    continue;
  }

  // Self-registered institutions are born claim_status 'claimed'; anything else got here
  // through an admin or an import, which is what "manual" means in the create path.
  const sourceType: keyof typeof PLACEHOLDER_DOMAIN = inst.claim_status === "claimed" ? "self_service" : "manual";
  const jobUrl = url ?? `https://${PLACEHOLDER_DOMAIN[sourceType]}/${inst.subdomain ?? inst.id}`;
  console.log(`  mint  ${inst.id} ${name} → ${sourceType} job at ${jobUrl}`);
  if (APPLY) {
    await masterKnex.transaction(async (trx) => {
      const row = await insertJob(
        {
          institution_name: inst.institution_name,
          institution_url: jobUrl,
          source_type: sourceType,
          // Never pending/processing/stalled — the pipeline workers claim on those and would
          // go and crawl the site.
          status: "done",
          business_category_id: await findCategoryIdBySlug("institutions"),
        },
        trx,
      );
      await trx("institutions").where({ id: inst.id }).update({ source_job_id: row.id, updated_at: trx.fn.now() });
    });
  }
  tally.minted++;
}

console.log(
  `\n${APPLY ? "applied" : "planned"}: ${tally.linked} linked, ${tally.minted} minted` +
    `, ${tally.sharedSkipped} skipped (job already in use), ${tally.mintSkipped} skipped (no job to link)`,
);
if (!APPLY) console.log("Re-run with --apply to write.");

await masterKnex.destroy();
