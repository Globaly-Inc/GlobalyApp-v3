// Wave A-COV — the staging writer and its junction assignments, against real Postgres.
//
// Defect D8: `ON CONFLICT DO NOTHING` turns an ordering bug into a silent orphan. The
// insert reports success, achieves nothing, and the transaction commits. No test that
// only asserts "did not throw" can see that, so every assertion here counts rows —
// specifically, how many parents each child is reachable from:
//
//   0 parents = an orphan. The row exists, nothing points at it, promote drops it.
//   2 parents = a duplicate. Promote carries both into the live catalog, and the
//               course page shows the same fee twice.
//
// The re-delivery case is the one that matters: LavinMQ redelivers an unacked
// message, the page worker re-queues a blocked page, an admin re-runs a step. All
// three call writeCourse again with the same payload, and the second call has to be
// a no-op rather than a second copy.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Knex } from "knex";

import { dbAvailable } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

const S = "superadmin";

describeDb("extraction staging writer", () => {
  let db: Knex;
  let writer: typeof import("../../src/modules/superadmin/data-extraction/lib/staging-writer.js");
  const jobIds: string[] = [];

  beforeAll(async () => {
    ({ masterKnex: db } = await import("../../src/core/db/master-pool.js"));
    writer = await import("../../src/modules/superadmin/data-extraction/lib/staging-writer.js");
  });

  afterAll(async () => {
    for (const jobId of jobIds) await db(`${S}.extraction_jobs`).where({ id: jobId }).del();
  });

  /** A fresh job, so no test can see another test's rows. */
  async function newJob(label: string): Promise<string> {
    const [job] = await db(`${S}.extraction_jobs`)
      .insert({
        institution_name: `A-COV ${label}`,
        institution_url: `https://acov-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.edu.au`,
        status: "processing",
      })
      .returning("id");
    jobIds.push(job.id);
    return job.id;
  }

  const count = async (table: string, where: Record<string, unknown>) =>
    Number((await db(`${S}.${table}`).where(where).count("id as c").first())?.c ?? 0);

  /**
   * How many courses reach this child through its junction. This is the number D8
   * corrupts: a swallowed insert leaves 0, a re-delivery leaves 2.
   */
  const parents = async (junction: string, column: string, childId: string) =>
    Number(
      (await db(`${S}.${junction}`).where({ [column]: childId }).countDistinct("course_id as c").first())?.c ?? 0,
    );

  /** Children of one course, by junction. */
  const linked = async (junction: string, courseId: string) =>
    Number((await db(`${S}.${junction}`).where({ course_id: courseId }).count("id as c").first())?.c ?? 0);

  /** A course as the LLM hands it over, with one of every child entity. */
  const FULL_COURSE = {
    name: "Bachelor of Creative Arts (Theatre Arts)",
    degree_level: "Bachelor",
    duration_weeks: 156,
    source_url: "https://acov.edu.au/course/creative-arts",
    fees: [
      {
        name: "Tuition & Fees",
        student_type: "international",
        period_type: "Per Year",
        currency: "AUD",
        total_amount: 20938.5,
      },
    ],
    intakes: [
      {
        intake_name: "Semester 1",
        start_date: "2027-02-22",
        intake_month: "February",
        intake_year: "2027",
      },
    ],
    study_options: [
      { name: "Full time on campus", study_mode: "on_campus", study_load: "full_time", duration_value: 36 },
    ],
    eligibility: [
      { name: "ATAR", applicable_to: "domestic", min_score_percent: 72.5, description: "ATAR 72.50 or equivalent" },
    ],
    english_requirements: [
      { test_type_name: "IELTS", overall_score: "6.5", writing_score: "6.0" },
    ],
    campus_names: ["Sydney Campus"],
  };

  async function withCampus(jobId: string) {
    const campusId = await writer.upsertCampus(jobId, { name: "Sydney", city: "Sydney" });
    return new Map([[writer.normaliseCampusName("Sydney"), campusId]]);
  }

  // ── re-delivery ───────────────────────────────────────────────────────────

  describe("a re-delivered message", () => {
    it("writes one of everything the first time", async () => {
      const jobId = await newJob("first-write");
      const courseId = await writer.writeCourse(jobId, FULL_COURSE, await withCampus(jobId));

      expect(await count("extraction_courses", { job_id: jobId })).toBe(1);
      expect(await count("extraction_course_fees", { job_id: jobId })).toBe(1);
      expect(await count("extraction_intakes", { job_id: jobId })).toBe(1);
      expect(await count("extraction_study_options", { job_id: jobId })).toBe(1);
      expect(await count("extraction_eligibility_requirements", { job_id: jobId })).toBe(1);
      expect(await count("extraction_english_requirements", { job_id: jobId })).toBe(1);

      expect(await linked("extraction_course_fee_assignments", courseId)).toBe(1);
      expect(await linked("extraction_course_intake_assignments", courseId)).toBe(1);
      expect(await linked("extraction_course_study_option_assignments", courseId)).toBe(1);
      expect(await linked("extraction_course_eligibility_assignments", courseId)).toBe(1);
      expect(await linked("extraction_course_campuses", courseId)).toBe(1);
    });

    it("changes nothing the second time — same course id, same child rows", async () => {
      const jobId = await newJob("redelivery");
      const campuses = await withCampus(jobId);
      const firstId = await writer.writeCourse(jobId, FULL_COURSE, campuses);
      const feeIdsBefore = await db(`${S}.extraction_course_fees`).where({ job_id: jobId }).pluck("id");

      const secondId = await writer.writeCourse(jobId, FULL_COURSE, campuses);

      expect(secondId).toBe(firstId);
      expect(await count("extraction_courses", { job_id: jobId })).toBe(1);
      expect(await count("extraction_course_fees", { job_id: jobId })).toBe(1);
      expect(await count("extraction_intakes", { job_id: jobId })).toBe(1);
      expect(await count("extraction_study_options", { job_id: jobId })).toBe(1);
      expect(await count("extraction_eligibility_requirements", { job_id: jobId })).toBe(1);
      expect(await count("extraction_english_requirements", { job_id: jobId })).toBe(1);
      // The same fee row, not a fresh one that the junction's UNIQUE could not see.
      expect(await db(`${S}.extraction_course_fees`).where({ job_id: jobId }).pluck("id")).toEqual(
        feeIdsBefore,
      );
    });

    it("leaves every child with exactly one parent after the re-delivery", async () => {
      const jobId = await newJob("parent-counts");
      const campuses = await withCampus(jobId);
      const courseId = await writer.writeCourse(jobId, FULL_COURSE, campuses);
      await writer.writeCourse(jobId, FULL_COURSE, campuses);

      const [fee] = await db(`${S}.extraction_course_fees`).where({ job_id: jobId });
      const [intake] = await db(`${S}.extraction_intakes`).where({ job_id: jobId });
      const [option] = await db(`${S}.extraction_study_options`).where({ job_id: jobId });
      const [elig] = await db(`${S}.extraction_eligibility_requirements`).where({ job_id: jobId });

      expect(await parents("extraction_course_fee_assignments", "course_fee_id", fee.id)).toBe(1);
      expect(await parents("extraction_course_intake_assignments", "intake_id", intake.id)).toBe(1);
      expect(
        await parents("extraction_course_study_option_assignments", "study_option_id", option.id),
      ).toBe(1);
      expect(
        await parents("extraction_course_eligibility_assignments", "eligibility_requirement_id", elig.id),
      ).toBe(1);
      // And exactly one junction row per child, not two rows naming one parent.
      expect(await linked("extraction_course_fee_assignments", courseId)).toBe(1);
      expect(await linked("extraction_course_campuses", courseId)).toBe(1);
    });

    it("orphans nothing: every staged child is reachable from a course", async () => {
      const jobId = await newJob("no-orphans");
      const campuses = await withCampus(jobId);
      await writer.writeCourse(jobId, FULL_COURSE, campuses);
      await writer.writeCourse(jobId, FULL_COURSE, campuses);

      const orphanFees = await db(`${S}.extraction_course_fees as f`)
        .where("f.job_id", jobId)
        .whereNotExists(
          db(`${S}.extraction_course_fee_assignments as a`).whereRaw("a.course_fee_id = f.id"),
        );
      expect(orphanFees).toEqual([]);

      const danglingCampusLinks = await db(`${S}.extraction_course_campuses as j`)
        .where("j.job_id", jobId)
        .whereNotExists(db(`${S}.extraction_campuses as c`).whereRaw("c.id = j.campus_id"));
      expect(danglingCampusLinks).toEqual([]);
    });

    it("dedups a name the normaliser calls equal but LOWER(TRIM()) does not", async () => {
      // "Bachelor of Nursing." and "Bachelor  of Nursing" both normalise to
      // "bachelor of nursing". 5 of the 26 duplicate name groups in the migrated
      // corpus are this exact mismatch between the probe and the comparison.
      const jobId = await newJob("dedup-normalise");
      const campuses = new Map<string, string>();
      const first = await writer.writeCourse(jobId, { name: "Bachelor of Nursing" }, campuses);
      const second = await writer.writeCourse(jobId, { name: "Bachelor of Nursing." }, campuses);
      const third = await writer.writeCourse(jobId, { name: "  Bachelor  of Nursing  " }, campuses);

      expect(second).toBe(first);
      expect(third).toBe(first);
      expect(await count("extraction_courses", { job_id: jobId })).toBe(1);
    });

    it("keeps two genuinely different courses apart", async () => {
      const jobId = await newJob("distinct-courses");
      const campuses = new Map<string, string>();
      const a = await writer.writeCourse(jobId, { name: "Bachelor of Nursing" }, campuses);
      const b = await writer.writeCourse(jobId, { name: "Master of Nursing" }, campuses);
      expect(b).not.toBe(a);
      expect(await count("extraction_courses", { job_id: jobId })).toBe(2);
    });
  });

  // ── junction assignment ───────────────────────────────────────────────────

  describe("junction assignment", () => {
    it("shares one fee row between two courses that quote the same fee", async () => {
      // This is what the junction table is for. The fee reaches 2 parents, and both
      // courses promote with the fee — the number to watch is 2, not "no error".
      const jobId = await newJob("shared-fee");
      const campuses = new Map<string, string>();
      const shared = {
        name: "Tuition & Fees",
        student_type: "international",
        period_type: "Per Year",
        currency: "AUD",
        total_amount: 30000,
      };
      const a = await writer.writeCourse(jobId, { name: "Bachelor of Arts", fees: [shared] }, campuses);
      const b = await writer.writeCourse(jobId, { name: "Bachelor of Laws", fees: [shared] }, campuses);

      expect(await count("extraction_course_fees", { job_id: jobId })).toBe(1);
      const [fee] = await db(`${S}.extraction_course_fees`).where({ job_id: jobId });
      expect(await parents("extraction_course_fee_assignments", "course_fee_id", fee.id)).toBe(2);
      expect(await linked("extraction_course_fee_assignments", a)).toBe(1);
      expect(await linked("extraction_course_fee_assignments", b)).toBe(1);
    });

    it("keeps a domestic and an international fee as two rows on one course", async () => {
      const jobId = await newJob("two-fees");
      const courseId = await writer.writeCourse(
        jobId,
        {
          name: "Bachelor of Science in Animal Behavior",
          fees: [
            { student_type: "domestic", total_amount: 8000.5, currency: "AUD", period_type: "Per Year" },
            { student_type: "international", total_amount: 8000.5, currency: "AUD", period_type: "Per Year" },
          ],
        },
        new Map(),
      );
      expect(await count("extraction_course_fees", { job_id: jobId })).toBe(2);
      expect(await linked("extraction_course_fee_assignments", courseId)).toBe(2);
    });

    it("does not lose a link when the same course is written from two pages", async () => {
      // Page A carries the fees, page B carries the intakes. Both call writeCourse
      // for the same course name, and the course has to end up with both.
      const jobId = await newJob("two-pages");
      const campuses = new Map<string, string>();
      const name = "Master of Engineering (ME) - Electrical Engineering Specialization";
      const courseId = await writer.writeCourse(
        jobId,
        { name, fees: [{ student_type: "international", total_amount: 16462.75 }] },
        campuses,
      );
      await writer.writeCourse(
        jobId,
        { name, intakes: [{ intake_name: "Semester 2", intake_month: 7, intake_year: 2027 }] },
        campuses,
      );

      expect(await linked("extraction_course_fee_assignments", courseId)).toBe(1);
      expect(await linked("extraction_course_intake_assignments", courseId)).toBe(1);
      expect(await count("extraction_courses", { job_id: jobId })).toBe(1);
    });

    it("skips a campus link the id map has no id for, rather than writing a null", async () => {
      const jobId = await newJob("unknown-campus");
      const courseId = await writer.writeCourse(
        jobId,
        { name: "Bachelor of Arts", campus_names: ["Melbourne Campus"] },
        new Map(),
      );
      expect(await linked("extraction_course_campuses", courseId)).toBe(0);
      expect(await count("extraction_course_campuses", { job_id: jobId, campus_id: null })).toBe(0);
    });
  });

  // ── replaceCampuses ───────────────────────────────────────────────────────

  describe("replaceCampuses", () => {
    async function jobWithTwoCampuses(label: string) {
      const jobId = await newJob(label);
      const sydney = await writer.upsertCampus(jobId, { name: "Sydney", city: "Sydney" });
      const perth = await writer.upsertCampus(jobId, { name: "Perth Campus", city: "Perth" });
      const map = new Map([
        [writer.normaliseCampusName("Sydney"), sydney],
        [writer.normaliseCampusName("Perth Campus"), perth],
      ]);
      const courseId = await writer.writeCourse(
        jobId,
        { name: "Bachelor of Arts", campus_names: ["Sydney", "Perth Campus"] },
        map,
      );
      expect(await linked("extraction_course_campuses", courseId)).toBe(2);
      return { jobId, courseId };
    }

    it("re-points both junctions at the new campus rows, keeping the count at 2", async () => {
      const { jobId, courseId } = await jobWithTwoCampuses("campus-repoint");
      const idMap = await writer.replaceCampuses(jobId, [
        { name: "Sydney Campus", city: "Sydney", phone: "+61 2 5550 0000" },
        { name: "perth", city: "Perth" },
      ]);

      expect(idMap.size).toBe(2);
      expect(await linked("extraction_course_campuses", courseId)).toBe(2);
      // Every junction points at a campus that exists — the FK is ON DELETE SET NULL,
      // so a missed re-point would leave a row with a null parent, not an error.
      const dangling = await db(`${S}.extraction_course_campuses as j`)
        .where("j.job_id", jobId)
        .where((q) =>
          q
            .whereNull("j.campus_id")
            .orWhereNotExists(db(`${S}.extraction_campuses as c`).whereRaw("c.id = j.campus_id")),
        );
      expect(dangling).toEqual([]);
    });

    it("drops exactly the link whose campus is gone, and no others", async () => {
      const { jobId, courseId } = await jobWithTwoCampuses("campus-dropped");
      await writer.replaceCampuses(jobId, [{ name: "Sydney", city: "Sydney" }]);

      expect(await linked("extraction_course_campuses", courseId)).toBe(1);
      const [remaining] = await db(`${S}.extraction_course_campuses`).where({ job_id: jobId });
      expect(writer.normaliseCampusName(remaining.campus_name)).toBe("sydney");
    });

    it("does not duplicate a junction when called twice with the same list", async () => {
      const { jobId, courseId } = await jobWithTwoCampuses("campus-twice");
      const list = [{ name: "Sydney", city: "Sydney" }, { name: "Perth Campus", city: "Perth" }];
      await writer.replaceCampuses(jobId, list);
      await writer.replaceCampuses(jobId, list);
      expect(await linked("extraction_course_campuses", courseId)).toBe(2);
      expect(await count("extraction_campuses", { job_id: jobId })).toBe(2);
    });

    it("collapses two spellings of one campus into a single row", async () => {
      const jobId = await newJob("campus-dedup");
      const idMap = await writer.replaceCampuses(jobId, [
        { name: "Sydney" },
        { name: "sydney campus" },
        { name: "  Sydney  Campus " },
        { name: null },
      ]);
      expect(idMap.size).toBe(1);
      expect(await count("extraction_campuses", { job_id: jobId })).toBe(1);
    });
  });

  describe("upsertCampus", () => {
    it("returns the existing id for a differently-spelled same campus", async () => {
      const jobId = await newJob("campus-upsert");
      const first = await writer.upsertCampus(jobId, { name: "Sydney", city: "Sydney" });
      const second = await writer.upsertCampus(jobId, { name: "  SYDNEY Campus " });
      expect(second).toBe(first);
      expect(await count("extraction_campuses", { job_id: jobId })).toBe(1);
    });

    it("returns an empty id for a nameless campus instead of inserting one", async () => {
      const jobId = await newJob("campus-nameless");
      expect(await writer.upsertCampus(jobId, { city: "Sydney" })).toBe("");
      expect(await count("extraction_campuses", { job_id: jobId })).toBe(0);
    });
  });

  // ── money ─────────────────────────────────────────────────────────────────

  describe("money", () => {
    it("stores a fractional fee to the cent", async () => {
      // 11% of the corpus's fee amounts are fractional. total_amount is NUMERIC, so
      // the assertion is on the exact decimal text pg returns — no float anywhere.
      const jobId = await newJob("money-exact");
      await writer.writeCourse(
        jobId,
        {
          name: "Bachelor of Business Administration in Management",
          fees: [
            { student_type: "international", total_amount: 20938.5, currency: "AUD" },
            { student_type: "domestic", total_amount: 16462.75, currency: "AUD" },
          ],
        },
        new Map(),
      );
      const amounts = (
        await db(`${S}.extraction_course_fees`).where({ job_id: jobId }).orderBy("total_amount")
      ).map((r) => String(r.total_amount));
      expect(amounts).toEqual(["16462.75", "20938.5"]); // NUMERIC with no scale: pg returns the exact value, unpadded
    });

    it("stores a fractional eligibility score without flooring it", async () => {
      const jobId = await newJob("money-score");
      await writer.writeCourse(
        jobId,
        {
          name: "Bachelor of Arts",
          eligibility: [{ name: "ATAR", min_score_percent: 72.5, applicable_to: "domestic" }],
        },
        new Map(),
      );
      const [row] = await db(`${S}.extraction_eligibility_requirements`).where({ job_id: jobId });
      expect(String(row.min_score_percent)).toBe("72.5");
    });

    it("lands an unparseable amount as 0 for review, never as NaN or a crash", async () => {
      const jobId = await newJob("money-junk");
      await writer.writeCourse(
        jobId,
        {
          name: "Bachelor of Arts",
          fees: [{ student_type: "both", total_amount: "about eight thousand" as unknown as number }],
        },
        new Map(),
      );
      const [row] = await db(`${S}.extraction_course_fees`).where({ job_id: jobId });
      expect(String(row.total_amount)).toBe("0");
    });

    it("coerces an LLM month name and a string year into integers", async () => {
      const jobId = await newJob("month-coerce");
      await writer.writeCourse(
        jobId,
        {
          name: "Bachelor of Arts",
          intakes: [
            { intake_name: "Autumn", intake_month: "September", intake_year: "2027" },
            { intake_name: "Winter", intake_month: 13, intake_year: null },
          ],
        },
        new Map(),
      );
      const rows = await db(`${S}.extraction_intakes`).where({ job_id: jobId }).orderBy("intake_name");
      expect(rows.map((r) => [r.intake_name, r.intake_month, r.intake_year])).toEqual([
        ["Autumn", 9, 2027],
        ["Winter", null, null], // 13 is not a month; null beats a fabricated one
      ]);
    });
  });

  // ── partial failure ───────────────────────────────────────────────────────

  describe("a child insert that fails", () => {
    it("leaves no half-written course behind", async () => {
      // The fee is written before the intake, so without a transaction the course and
      // its fee commit and only the intake is lost — a course whose fee is real and
      // whose intake silently never existed.
      const jobId = await newJob("partial-failure");
      await expect(
        writer.writeCourse(
          jobId,
          {
            name: "Doctor of Philosophy in Chemical Engineering",
            fees: [{ student_type: "international", total_amount: 30000 }],
            intakes: [{ intake_name: "Semester 1", start_date: "not-a-date" }],
          },
          new Map(),
        ),
      ).rejects.toThrow();

      expect(await count("extraction_courses", { job_id: jobId })).toBe(0);
      expect(await count("extraction_course_fees", { job_id: jobId })).toBe(0);
      expect(await count("extraction_course_fee_assignments", { job_id: jobId })).toBe(0);
      expect(await count("extraction_intakes", { job_id: jobId })).toBe(0);
    });

    it("does not damage the course a previous page already wrote", async () => {
      const jobId = await newJob("partial-keeps-prior");
      const name = "Master of Environment and Climate Emergency";
      const courseId = await writer.writeCourse(
        jobId,
        { name, fees: [{ student_type: "international", total_amount: 22750 }] },
        new Map(),
      );
      await expect(
        writer.writeCourse(
          jobId,
          { name, intakes: [{ intake_name: "Semester 1", start_date: "31/02/2027" }] },
          new Map(),
        ),
      ).rejects.toThrow();

      expect(await count("extraction_courses", { job_id: jobId })).toBe(1);
      expect(await linked("extraction_course_fee_assignments", courseId)).toBe(1);
      expect(await count("extraction_intakes", { job_id: jobId })).toBe(0);
    });
  });

  // ── merge into an existing course ─────────────────────────────────────────

  describe("merging a second extraction of the same course", () => {
    it("fills nulls and never overwrites a value already there", async () => {
      const jobId = await newJob("merge-fill");
      const campuses = new Map<string, string>();
      const courseId = await writer.writeCourse(
        jobId,
        { name: "Master of Arts", degree_level: "Master", duration_weeks: 104 },
        campuses,
      );
      await writer.writeCourse(
        jobId,
        {
          name: "Master of Arts",
          degree_level: "Bachelor", // wrong, and later: must not win
          duration_weeks: 52,
          subject_area: "Humanities", // new: must land
          description: "",
        },
        campuses,
      );
      const row = await db(`${S}.extraction_courses`).where({ id: courseId }).first();
      expect(row.degree_level).toBe("Master");
      expect(row.duration_weeks).toBe(104);
      expect(row.subject_area).toBe("Humanities");
      expect(row.description).toBeNull();
    });

    it("fills an empty career_paths array but leaves a populated one alone", async () => {
      const jobId = await newJob("merge-arrays");
      const campuses = new Map<string, string>();
      const courseId = await writer.writeCourse(jobId, { name: "Master of Arts" }, campuses);
      await writer.writeCourse(
        jobId,
        { name: "Master of Arts", career_paths: ["Curator", "Archivist"] },
        campuses,
      );
      await writer.writeCourse(jobId, { name: "Master of Arts", career_paths: ["Barista"] }, campuses);
      const row = await db(`${S}.extraction_courses`).where({ id: courseId }).first();
      expect(row.career_paths).toEqual(["Curator", "Archivist"]);
    });

    it("marks a new course unverified rather than trusting the extraction", async () => {
      const jobId = await newJob("unverified");
      const courseId = await writer.writeCourse(jobId, { name: "Master of Arts" }, new Map());
      const row = await db(`${S}.extraction_courses`).where({ id: courseId }).first();
      expect(row.verification_status).toBe("unverified");
    });
  });

  // ── the small writers ─────────────────────────────────────────────────────

  describe("the other staging writers", () => {
    it("writes an institution overview and a site-intelligence row", async () => {
      const jobId = await newJob("overview");
      await writer.writeInstitutionOverview(jobId, {
        name: "A-COV University",
        website: "https://acov.edu.au",
        country: "Australia",
      });
      await writer.writeSiteIntelligence(jobId, {
        institution_name: "A-COV University",
        currency: "AUD",
        fee_structure: { per_year: true },
        extraction_hints: ["fees live on /fees"],
        navigation_patterns: { courses: "/course/{slug}" },
      });
      const intel = await db(`${S}.extraction_site_intelligence`).where({ job_id: jobId }).first();
      expect(intel.currency).toBe("AUD");
      expect(intel.fee_structure).toEqual({ per_year: true });
      expect(intel.extraction_hints).toEqual(["fees live on /fees"]);
    });

    it("omits the jsonb columns entirely when the LLM sent none", async () => {
      const jobId = await newJob("intel-minimal");
      await writer.writeSiteIntelligence(jobId, { institution_name: "A-COV" });
      const intel = await db(`${S}.extraction_site_intelligence`).where({ job_id: jobId }).first();
      expect(intel.institution_name).toBe("A-COV");
    });

    it("upserts an agent by external id, merging only into empty fields", async () => {
      const jobId = await newJob("agent-upsert");
      const first = await writer.upsertAgent(
        jobId,
        { name: "Acme Education", email: "hello@acme.test" },
        "acme-1",
      );
      const second = await writer.upsertAgent(
        jobId,
        { name: "Acme Education Pty Ltd", phone: "+61 2 5550 1111", website: "" },
        "acme-1",
      );
      expect(second).toBe(first);
      const row = await db(`${S}.extraction_agents`).where({ id: first }).first();
      expect(row.name).toBe("Acme Education");
      expect(row.phone).toBe("+61 2 5550 1111");
      expect(await count("extraction_agents", { job_id: jobId })).toBe(1);
    });

    it("replaces an agent's locations rather than appending to them", async () => {
      const jobId = await newJob("agent-locations");
      const agentId = await writer.upsertAgent(jobId, { name: "Acme" }, "acme-2");
      await writer.writeAgentLocations(agentId, jobId, [{ city: "Sydney" }, { city: "Perth" }]);
      await writer.writeAgentLocations(agentId, jobId, [{ city: "Sydney" }]);
      const rows = await db(`${S}.extraction_agent_locations`).where({ agent_id: agentId });
      expect(rows.map((r) => r.city)).toEqual(["Sydney"]);
    });

    it("clears the locations when the new list is empty", async () => {
      const jobId = await newJob("agent-locations-empty");
      const agentId = await writer.upsertAgent(jobId, { name: "Acme" }, "acme-3");
      await writer.writeAgentLocations(agentId, jobId, [{ city: "Sydney" }]);
      await writer.writeAgentLocations(agentId, jobId, []);
      expect(await count("extraction_agent_locations", { agent_id: agentId })).toBe(0);
    });

    it("queues a discovered URL as pending", async () => {
      const jobId = await newJob("queue-item");
      const id = await writer.insertQueueItem(jobId, "https://acov.edu.au/course/nursing");
      const row = await db(`${S}.extraction_queue`).where({ id }).first();
      expect(row.status).toBe("pending");
      expect(row.url).toBe("https://acov.edu.au/course/nursing");
    });

    it("writes a job event with a jsonb payload and an info default", async () => {
      const jobId = await newJob("job-event");
      await writer.writeJobEvent(jobId, "page_extracted", {
        phase: "data_extraction",
        message: "Extracted 3 courses",
        data: { url: "https://acov.edu.au/courses", courses: 3 },
      });
      await writer.writeJobEvent(jobId, "page_error");
      const rows = await db(`${S}.extraction_job_events`).where({ job_id: jobId }).orderBy("kind");
      expect(rows.map((r) => r.level)).toEqual(["info", "info"]);
      expect(rows.find((r) => r.kind === "page_extracted").data).toEqual({
        url: "https://acov.edu.au/courses",
        courses: 3,
      });
      expect(rows.find((r) => r.kind === "page_error").data).toEqual({});
    });
  });

  describe("normalisers", () => {
    it("normaliseCampusName folds case, whitespace and the word Campus", () => {
      for (const raw of ["Sydney", " sydney ", "SYDNEY CAMPUS", "Sydney  Campus"]) {
        expect(writer.normaliseCampusName(raw)).toBe("sydney");
      }
    });

    it("normaliseCourseName folds case, whitespace and trailing punctuation only", () => {
      expect(writer.normaliseCourseName(" Bachelor  of Nursing. ")).toBe("bachelor of nursing");
      // Leading and interior punctuation is meaning, not noise.
      expect(writer.normaliseCourseName("B.Sc. (Hons) Nursing")).toBe("b.sc. (hons) nursing");
    });
  });
});
