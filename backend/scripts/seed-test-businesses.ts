/**
 * Dev data: three business accounts cloned from an existing one's matching setup.
 *
 *   node --import tsx scripts/seed-test-businesses.ts <platform_users.uuid>
 *
 * The uuid is a platform_user who already owns a business. That business is the template: its
 * `enquiry_match_directory` rows and its active `representations` are copied verbatim onto three
 * new businesses, so all four match exactly the same enquiries.
 *
 * Copied rather than invented, because those two tables are the whole of matching eligibility
 * (see matching.service.ts):
 *   - `representations` is the ONLY gate on who may receive an enquiry. Same rows in, same
 *     courses covered.
 *   - `enquiry_match_directory.country_code` must equal the student's resolved country or the
 *     business matches nothing at all — country is a hard gate, not a tie-breaker. Copying the
 *     template's value is what keeps the clones eligible for the same students.
 *   - latitude/longitude are copied as-is, so the clones sit in the same distance band as the
 *     template and rank alongside it rather than behind it.
 *
 * The one thing NOT copied verbatim is duplicate directory rows — see the dedupe below, which
 * is what keeps the clones from being crowded out of the match.
 *
 * Businesses are created through registerBusiness, the same call the onboarding route makes, so
 * each gets a real tenant schema, an owner agent and a user_business_index row. Hand-written
 * INSERTs would produce a business nobody can sign into.
 *
 * Re-runnable: users and businesses are reused, directory and representation rows re-synced.
 */
import { masterKnex } from "../src/core/db/master-pool.js";
import { registerBusiness } from "../src/modules/businesses/services/businesses.service.js";

const EMAILS = [
  "rojan.byanjankar+03@globalyhub.com",
  "rojan.byanjankar+04@globalyhub.com",
  "rojan.byanjankar+05@globalyhub.com",
];

async function main() {
  const uuid = process.argv[2];
  if (!uuid) throw new Error("usage: seed-test-businesses.ts <platform_users.uuid>");

  const user = await masterKnex("platform_users").where({ uuid }).first("id", "email");
  if (!user) throw new Error(`no platform_users row with uuid ${uuid}`);

  // Owned first, then any membership — the uuid's owner may have been added to the business
  // rather than having registered it.
  const template =
    (await masterKnex("businesses").where({ owner_id: user.id }).whereNull("deleted_at").first()) ??
    (await masterKnex("businesses as b")
      .join("user_business_index as ubi", "ubi.business_id", "b.id")
      .where("ubi.platform_user_id", user.id)
      .whereNull("ubi.deleted_at")
      .whereNull("b.deleted_at")
      .first("b.*"));
  if (!template) throw new Error(`${user.email} (uuid ${uuid}) owns no business to copy from`);

  const templateDirectoryRaw = await masterKnex("enquiry_match_directory").where({ business_id: template.id });

  // Deduped down to the fields matching actually reads, and this is load-bearing rather than
  // tidiness. matchAndCommit builds one candidate per directory ROW, not per business, then
  // takes the closest MAX_DISTRIBUTIONS of them. A business with 17 rows at one location
  // therefore occupies all six slots itself and crowds every other eligible business out of
  // the result. Cloning the duplicates would have made these three businesses ineligible in
  // practice — exactly what this script exists to prevent. `subject_area` is what actually
  // varies across those rows, and matching stopped reading it when representations took over
  // eligibility, so collapsing on it loses nothing.
  const templateDirectory = [
    ...new Map(
      templateDirectoryRaw.map((d) => [
        JSON.stringify([d.country_code, d.verification_status, d.latitude, d.longitude, d.is_suspended, d.is_institution_contact]),
        d,
      ]),
    ).values(),
  ];
  const templateReps = await masterKnex("representations")
    .where({ business_id: template.id, status: "active" })
    .whereNull("deleted_at");

  if (templateDirectory.length === 0) {
    throw new Error(`business ${template.id} has no enquiry_match_directory rows — nothing to clone`);
  }
  if (templateReps.length === 0) {
    throw new Error(`business ${template.id} has no active representations — the clones would match nothing`);
  }

  // Naming the courses makes the output checkable at a glance; the copy itself only needs ids.
  const repCourses = await masterKnex("superadmin.extraction_courses")
    .whereIn("id", templateReps.map((r) => r.extraction_course_id).filter(Boolean))
    .select("id", "name");
  const courseName = new Map(repCourses.map((c) => [c.id, c.name]));

  console.log(`template: "${template.business_name}" (id ${template.id}) owned by ${user.email}`);
  console.log(`location: ${template.city ?? "—"}, country_id ${template.country_id ?? "—"}`);
  const collapsed = templateDirectoryRaw.length - templateDirectory.length;
  console.log(
    `directory rows: ${templateDirectory.length}` +
      (collapsed > 0 ? ` (${templateDirectoryRaw.length} on the template, ${collapsed} redundant duplicates dropped)` : ""),
  );
  for (const d of templateDirectory) {
    console.log(
      `          • ${d.country_code ?? "—"} ${d.verification_status} (${d.latitude ?? "—"}, ${d.longitude ?? "—"})` +
        `${d.subject_area ? ` subject=${d.subject_area}` : ""}${d.is_institution_contact ? " is_institution_contact" : ""}`,
    );
  }
  console.log(`representations: ${templateReps.length}`);
  for (const r of templateReps) {
    console.log(`          • ${courseName.get(r.extraction_course_id) ?? r.extraction_course_id ?? `job ${r.extraction_job_id}`}`);
  }

  if (templateDirectory.some((d) => d.is_institution_contact)) {
    console.warn(
      "\n! the template is flagged is_institution_contact, which a business earns by being an\n" +
        "  institution's SOLE representer. Copying it gives that institution four contacts and\n" +
        "  makes the last-resort fallback pick an arbitrary one. Copied verbatim as asked —\n" +
        "  clear the flag on the clones if the fallback matters to what you are testing.",
    );
  }
  console.log("");

  for (const [i, email] of EMAILS.entries()) {
    const n = String(i + 3).padStart(2, "0");

    let owner = await masterKnex("platform_users").where({ email }).first();
    if (!owner) {
      [owner] = await masterKnex("platform_users")
        .insert({
          first_name: "Rojan",
          last_name: `Test ${n}`,
          email,
          account_status: 1, // active, so the account is signable-in without the OTP dance
          is_email_verified: true,
          is_business_account: true,
        })
        .returning("*");
      console.log(`[${n}] user     created  id ${owner.id}  ${email}`);
    } else {
      console.log(`[${n}] user     reused   id ${owner.id}  ${email}`);
    }

    let business = await masterKnex("businesses").where({ owner_id: owner.id }).whereNull("deleted_at").first();
    if (!business) {
      // Returns a sign-in payload ({ org, access_token }), not the row — re-read it, which also
      // keeps the created and reused branches on one shape.
      await registerBusiness(owner.id, {
        business_name: `Rojan Test Agency ${n}`,
        ...(template.business_type ? { business_type: template.business_type } : {}),
        ...(template.business_category_id ? { business_category_id: template.business_category_id } : {}),
        ...(template.country_id ? { country_id: template.country_id } : {}),
        ...(template.state ? { state: template.state } : {}),
        ...(template.city ? { city: template.city } : {}),
        ...(template.address ? { address: template.address } : {}),
        ...(template.postcode ? { postcode: template.postcode } : {}),
      });
      business = await masterKnex("businesses").where({ owner_id: owner.id }).whereNull("deleted_at").first();
      if (!business) throw new Error(`registerBusiness produced no business row for ${email}`);
      console.log(`[${n}] business created  id ${business.id}  ${business.subdomain}`);
    } else {
      console.log(`[${n}] business reused   id ${business.id}  ${business.business_name}`);
    }

    // The clone's own profile coordinates, so the business record agrees with the directory
    // row the matcher reads. Only the directory row drives ranking.
    await masterKnex("businesses").where({ id: business.id }).update({
      latitude: template.latitude,
      longitude: template.longitude,
    });

    // Replace rather than merge: the directory is a projection of "where this business is and
    // what it is", so a stale row from an earlier run should not survive alongside a new one.
    // Same semantics as match-directory.repository's replaceForBusiness.
    await masterKnex("enquiry_match_directory").where({ business_id: business.id }).delete();
    await masterKnex("enquiry_match_directory").insert(
      templateDirectory.map((d) => ({
        business_id: business.id,
        subject_area: d.subject_area,
        country_code: d.country_code,
        verification_status: d.verification_status,
        latitude: d.latitude,
        longitude: d.longitude,
        is_suspended: d.is_suspended,
        is_institution_contact: d.is_institution_contact,
        synced_at: masterKnex.fn.now(),
      })),
    );
    console.log(`[${n}] directory ${templateDirectory.length} row(s) cloned`);

    for (const r of templateReps) {
      await masterKnex("representations")
        .insert({
          business_id: business.id,
          extraction_job_id: r.extraction_job_id,
          extraction_course_id: r.extraction_course_id,
          status: "active",
        })
        .onConflict(["business_id", "extraction_job_id", "extraction_course_id"])
        .merge({ status: "active", deleted_at: null });
    }
    console.log(`[${n}] reps      ${templateReps.length} active\n`);
  }

  console.log(`Done. Any enquiry that reaches "${template.business_name}" should now fan out to all four.`);
  await masterKnex.destroy();
}

main().catch(async (err) => {
  console.error(err);
  await masterKnex.destroy();
  process.exit(1);
});
