// One-off backfill for campuses created as bare `{ name }` stubs — extraction-page.worker.ts
// creates one of these whenever a course names a campus (its own institution, "Main Campus",
// or any other generic label) with no more specific location stated, via upsertCampus's
// course.campus_names path. That call only ever supplied a name, so any such row created
// before staging-writer.ts's upsertCampus fix (2026-09-09) is still fully blank apart from
// name. Applies the same three independent fixes upsertCampus now does live, each keyed off
// its own missing piece rather than an all-or-nothing "still fully bare" check — so re-running
// this after an earlier partial fill (or the live pipeline's own partial fill) keeps making
// progress instead of skipping a campus it already touched once:
//   - isMainCampusLabel(campus.name, institution.name) match (exact institution name, or a
//     generic label like "Main Campus") + no address yet → copies the institution's full
//     location and geocodes a map link from it
//   - no phone/email yet → copies the institution's phone/email regardless of campus name
//   - has an address already but no map_link → geocodes just the map link
//
// Run with: npm run backfill:stub-campuses            (every job)
//           npm run backfill:stub-campuses -- <jobId> (one job)

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { isMainCampusLabel } from "../src/modules/superadmin/data-extraction/lib/staging-writer.js";
import { geocodeAddress } from "../src/shared/google-places/placesService.js";
import { SUPERADMIN_SCHEMA as S } from "../src/modules/superadmin/consts.js";

async function geocode(address: string, city: unknown, state: unknown, country: unknown) {
  const addressLine = [address, city, state, country].filter(Boolean).join(", ");
  return geocodeAddress(addressLine).catch(() => null);
}

async function main() {
  const jobId = process.argv[2];
  const jobs = jobId
    ? [{ id: jobId }]
    : await masterKnex(`${S}.extraction_jobs`).select("id");

  let healed = 0;
  for (const job of jobs) {
    const overview = await masterKnex(`${S}.extraction_institution_overview`).where({ job_id: job.id }).first();
    if (!overview?.name) continue;
    if (!overview.address && !overview.phone && !overview.email) continue; // nothing to give

    const campuses = await masterKnex(`${S}.extraction_campuses`).where({ job_id: job.id });

    for (const campus of campuses) {
      if (!campus.name) continue;
      const update: Record<string, unknown> = {};

      if (!campus.address && overview.address && isMainCampusLabel(campus.name, overview.name)) {
        update.city = overview.city;
        update.state = overview.state;
        update.country = overview.country;
        update.address = overview.address;
        update.postcode = overview.zip_code;
        const geocoded = await geocode(overview.address, overview.city, overview.state, overview.country);
        if (geocoded) {
          update.map_link = geocoded.mapLink;
          if (!update.postcode) update.postcode = geocoded.postcode;
        }
      } else if (campus.address && !campus.map_link) {
        const geocoded = await geocode(campus.address, campus.city, campus.state, campus.country);
        if (geocoded) {
          update.map_link = geocoded.mapLink;
          if (!campus.postcode && geocoded.postcode) update.postcode = geocoded.postcode;
        }
      }

      if (!campus.phone && !campus.email && (overview.phone || overview.email)) {
        update.phone = overview.phone;
        update.email = overview.email;
      }

      if (Object.keys(update).length === 0) continue;

      await masterKnex(`${S}.extraction_campuses`).where({ id: campus.id }).update(update);
      healed++;
      console.log(`Healed "${campus.name}" — ${Object.keys(update).join(", ")} (campus ${campus.id}, job ${job.id})`);
    }
  }

  console.log(`\n${healed} campus${healed === 1 ? "" : "es"} backfilled.`);
  await masterKnex.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
