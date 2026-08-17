// Wave C2: the pure half of the promote pipeline — reference resolution, enum
// normalisation and the warning-vs-unresolvable distinction.

import { describe, expect, it } from "vitest";

import {
  buildRefIndex,
  mapCourseToService,
  mapEligibility,
  mapFee,
  mapStudyOption,
  mapStudyUnit,
  normalizeStudyMode,
  normalizeUnitType,
  resolveRef,
  slugify,
  websiteHost,
} from "../../src/modules/superadmin/data-extraction/lib/promote-mappers.js";

const degreeLevels = buildRefIndex([
  { id: 7, name: "Graduate Diploma", slug: "graduate_diploma" },
  { id: 4, name: "Bachelor", slug: "bachelor" },
]);
const areasOfStudy = buildRefIndex([{ id: 12, name: "Computer Science", slug: "computer_science" }]);

const ctx = {
  serviceCategoryId: 3,
  degreeLevels,
  areasOfStudy,
  publish: true,
  jobId: "11111111-1111-1111-1111-111111111111",
};

describe("reference resolution", () => {
  it("matches a name, a slug and either spelling of a separator", () => {
    expect(resolveRef(degreeLevels, "Graduate Diploma")).toBe(7);
    expect(resolveRef(degreeLevels, "graduate_diploma")).toBe(7);
    expect(resolveRef(degreeLevels, "graduate-diploma")).toBe(7);
    expect(resolveRef(degreeLevels, "  GRADUATE   DIPLOMA ")).toBe(7);
  });

  it("returns null rather than a nearest guess", () => {
    expect(resolveRef(degreeLevels, "Graduate")).toBeNull();
    expect(resolveRef(degreeLevels, "")).toBeNull();
    expect(resolveRef(degreeLevels, null, undefined)).toBeNull();
  });

  it("takes the first candidate that resolves", () => {
    expect(resolveRef(degreeLevels, "nonsense", "bachelor")).toBe(4);
  });
});

describe("enum normalisation", () => {
  it("maps known aliases and refuses unknown values", () => {
    expect(normalizeStudyMode("On Campus")).toBe("on_campus");
    expect(normalizeStudyMode("face-to-face")).toBe("on_campus");
    expect(normalizeStudyMode("hybrid")).toBe("blended");
    expect(normalizeStudyMode("telepathy")).toBeNull();
    expect(normalizeUnitType("core")).toBe("compulsory");
    expect(normalizeUnitType("")).toBeNull();
  });
});

describe("mapCourseToService", () => {
  const course = {
    id: "22222222-2222-2222-2222-222222222222",
    name: "  Bachelor of Computer Science  ",
    degree_level: "bachelor",
    subject_area: "computer_science",
    duration_weeks: 156,
    study_mode: "on_campus, online",
    international_fee_total: 32000,
    international_currency: "AUD",
    domestic_fee_total: 21000,
    domestic_currency: "AUD",
    career_paths: ["Software Engineer"],
  };

  it("maps a complete course with no warnings", () => {
    const { row, warnings } = mapCourseToService(course, ctx);
    expect(warnings).toEqual([]);
    expect(row).toMatchObject({
      extraction_source_id: course.id,
      name: "Bachelor of Computer Science",
      slug: "bachelor-of-computer-science",
      degree_level_id: 4,
      area_of_study_id: 12,
      service_category_id: 3,
      duration_value: 156,
      duration_unit: "weeks",
      study_mode: ["on_campus", "online"],
      price: 32000,
      price_currency: "AUD",
      is_published: true,
    });
    expect(JSON.parse(row!.meta)).toMatchObject({ extraction_job_id: ctx.jobId, extraction_course_id: course.id });
  });

  it("falls back to the domestic price when there is no international one", () => {
    const { row } = mapCourseToService({ ...course, international_fee_total: null }, ctx);
    expect(row!.price).toBe(21000);
    expect(row!.price_currency).toBe("AUD");
  });

  it("warns but still promotes when an optional reference does not resolve", () => {
    const { row, warnings } = mapCourseToService({ ...course, degree_level: "Sorcery", subject_area: null }, ctx);
    expect(row!.degree_level_id).toBeNull();
    expect(warnings).toEqual(['unmatched degree_level "Sorcery"']);
  });

  it("refuses a nameless course instead of inventing a name", () => {
    const { row, reason } = mapCourseToService({ ...course, name: "   " }, ctx);
    expect(row).toBeNull();
    expect(reason).toMatch(/no name/);
  });

  it("honours publish=false", () => {
    const { row } = mapCourseToService(course, { ...ctx, publish: false });
    expect(row!.is_published).toBe(false);
  });
});

describe("child mappers", () => {
  it("defaults an unknown student_type to both and says so", () => {
    const { row, warnings } = mapFee({ id: "f1", student_type: "aliens", total_amount: 10 }, "s1");
    expect(row).toMatchObject({ service_id: "s1", student_type: "both" });
    expect(warnings).toEqual(['unmatched student_type "aliens"']);
  });

  it("carries the staged score pair into the jsonb list", () => {
    const { row } = mapEligibility(
      { id: "e1", score_type: "gpa_4", min_score: 3.2, min_degree_level: "bachelor" },
      "s1",
      degreeLevels,
    );
    expect(row).toMatchObject({ degree_level_id: 4, min_grading_system: "gpa_4" });
    expect(JSON.parse(row!.min_scores as string)).toEqual([{ score_type: "gpa_4", min_score: 3.2 }]);
  });

  it("refuses a study option whose CHECK-constrained columns cannot be mapped", () => {
    expect(mapStudyOption({ id: "o1", study_mode: "telepathy", study_load: "full_time" }).reason).toMatch(
      /study_mode/,
    );
    expect(mapStudyOption({ id: "o1", study_mode: "online", study_load: "whenever" }).reason).toMatch(/study_load/);
    expect(
      mapStudyOption({ id: "o1", study_mode: "online", study_load: "part_time", duration_unit: "fortnights" }).reason,
    ).toMatch(/duration_unit/);

    const { row } = mapStudyOption({
      id: "o1",
      study_mode: "Online",
      study_load: "part time",
      applicable_to: "overseas",
      duration_unit: "month",
    });
    expect(row).toMatchObject({
      study_mode: "online",
      study_load: "part_time",
      applicable_to: "international",
      duration_unit: "months",
    });
  });

  it("refuses a nameless study unit", () => {
    expect(mapStudyUnit({ id: "u1", unit_name: " " }).row).toBeNull();
    expect(mapStudyUnit({ id: "u1", unit_name: "Reef Ecology" }).row).toMatchObject({ unit_name: "Reef Ecology" });
  });
});

describe("helpers", () => {
  it("reduces a url to a comparable host", () => {
    expect(websiteHost("https://www.Example.edu.au/courses?x=1")).toBe("example.edu.au");
    expect(websiteHost("example.edu.au")).toBe("example.edu.au");
    expect(websiteHost("not a url at all")).toBeNull();
    expect(websiteHost(null)).toBeNull();
  });

  it("slugifies without producing an empty slug", () => {
    expect(slugify("Bachelor of Arts (Honours)")).toBe("bachelor-of-arts-honours");
    expect(slugify("!!!")).toBe("service");
  });
});
