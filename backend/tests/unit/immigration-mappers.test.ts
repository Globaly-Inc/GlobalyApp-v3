// Staged immigration row → live row mapping rules. Zero external dependencies.
//
// The two cases that matter most are regressions of real V1 defects (§3.4):
// the MARA name column, and contact PII reaching the public directory table.

import { describe, expect, it } from "vitest";

import {
  mapMaraDetails,
  mapMaraToOrg,
  mapVisaDetails,
  mapVisaToService,
  maraOrgName,
  visaServiceName,
  type StagedMaraAgent,
  type StagedVisa,
} from "../../src/modules/superadmin/data-extraction/lib/immigration-mappers.js";

const visa = (over: Partial<StagedVisa> = {}): StagedVisa => ({
  id: "11111111-1111-1111-1111-111111111111",
  country_code: "au",
  subclass_code: "500",
  visa_stream: "Higher Education",
  category: "Student",
  name: "Student visa",
  description: "Study full time.",
  duration_months: 60,
  is_permanent: null,
  work_rights: { hours: 48 },
  study_rights: null,
  points_test_required: null,
  min_points: null,
  english_requirements: { ielts: 6 },
  age_min: 6,
  age_max: null,
  eligible_nationalities: ["NP"],
  excluded_nationalities: null,
  application_fee_amount: 1600,
  application_fee_currency: "AUD",
  processing_time_min_days: 20,
  processing_time_max_days: 60,
  official_url: "https://immi.example/500",
  source_url: "https://immi.example/500",
  confidence_score: 0.9,
  ...over,
});

const agent = (over: Partial<StagedMaraAgent> = {}): StagedMaraAgent => ({
  id: "22222222-2222-2222-2222-222222222222",
  marn: "MARN0001",
  agent_name: "Jane Registrar",
  business_name: "Migration Co",
  registration_status: "Registered",
  registration_date: "2020-01-01",
  expiry_date: "2030-01-01",
  website: "https://migration.example",
  practice_areas: ["skilled"],
  languages_spoken: ["English"],
  office_country: "Australia",
  office_state: "NSW",
  office_city: "Sydney",
  source_url: "https://mara.example/agent",
  ...over,
});

describe("visaServiceName", () => {
  it("uses the extracted name verbatim", () => {
    expect(visaServiceName(visa())).toBe("Student visa");
  });

  it("falls back to the subclass when there is no name", () => {
    expect(visaServiceName(visa({ name: null }))).toBe("Subclass 500");
    expect(visaServiceName(visa({ name: "   " }))).toBe("Subclass 500");
  });

  it("is null when neither exists", () => {
    expect(visaServiceName(visa({ name: null, subclass_code: null }))).toBeNull();
  });
});

describe("mapVisaToService", () => {
  it("produces a publishable service carrying the idempotency key", () => {
    const { row } = mapVisaToService(visa(), { serviceCategoryId: 7, publish: true });
    expect(row).toMatchObject({
      name: "Student visa",
      service_category_id: 7,
      is_published: true,
      extraction_source_id: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("refuses a row that could never be addressed by /:country/:subclass", () => {
    for (const broken of [visa({ country_code: null }), visa({ subclass_code: null })]) {
      const { row, reason } = mapVisaToService(broken, { serviceCategoryId: null, publish: true });
      expect(row).toBeNull();
      expect(reason).toMatch(/country_code|subclass_code/);
    }
  });
});

describe("mapVisaDetails", () => {
  const row = mapVisaDetails(visa(), "33333333-3333-3333-3333-333333333333", "schema-uuid");

  it("upper-cases the country code so /visas/au and /visas/AU agree", () => {
    expect(row.country_code).toBe("AU");
  });

  it("serialises jsonb columns as text, never as a JS object", () => {
    expect(row.work_rights).toBe('{"hours":48}');
    expect(row.english_requirements).toBe('{"ielts":6}');
    expect(row.study_rights).toBeNull();
  });

  it("defaults the two NOT NULL booleans rather than passing null through", () => {
    expect(row.is_permanent).toBe(false);
    expect(row.points_test_required).toBe(false);
  });

  it("records where the tenant service lives", () => {
    expect(row.service_id).toBe("33333333-3333-3333-3333-333333333333");
    expect(row.schema_name).toBe("schema-uuid");
  });
});

describe("maraOrgName — the V1 full_name defect", () => {
  // V1's promote_mara_to_business read `full_name`, a column that has never
  // existed on the staging table, so it raised on every promote.
  it("uses agent_name, the column that actually exists", () => {
    expect(maraOrgName(agent())).toBe("Jane Registrar");
  });

  it("falls back to the practice name, then to the MARN", () => {
    expect(maraOrgName(agent({ agent_name: null }))).toBe("Migration Co");
    expect(maraOrgName(agent({ agent_name: null, business_name: "  " }))).toBe("MARA agent MARN0001");
  });
});

describe("mapMaraToOrg", () => {
  it("creates an unclaimed, unpublished institution", () => {
    expect(mapMaraToOrg(agent())).toMatchObject({
      institution_name: "Jane Registrar",
      claim_status: "unclaimed",
      status: "pending",
      is_published: false,
    });
  });

  it("carries no email or phone onto the org row", () => {
    const row = mapMaraToOrg(agent());
    expect(Object.keys(row)).not.toContain("email");
    expect(Object.keys(row)).not.toContain("phone");
  });
});

describe("mapVisaDetails — null handling", () => {
  // Every optional column has to arrive as an explicit null, not as undefined:
  // knex omits undefined keys from the INSERT, so on a re-promote the ON CONFLICT
  // MERGE would leave the previous value in place instead of clearing it.
  const sparse = mapVisaDetails(
    visa({
      visa_stream: null,
      category: null,
      duration_months: null,
      work_rights: null,
      english_requirements: null,
      eligible_nationalities: null,
      excluded_nationalities: null,
      application_fee_amount: null,
      application_fee_currency: null,
      processing_time_min_days: null,
      processing_time_max_days: null,
      official_url: null,
      source_url: null,
      confidence_score: null,
      is_permanent: true,
      points_test_required: true,
    }),
    "44444444-4444-4444-4444-444444444444",
    "schema-uuid",
  );

  it("nulls every absent optional column", () => {
    for (const key of [
      "visa_stream",
      "category",
      "duration_months",
      "work_rights",
      "english_requirements",
      "eligible_nationalities",
      "excluded_nationalities",
      "application_fee_amount",
      "application_fee_currency",
      "processing_time_min_days",
      "processing_time_max_days",
      "official_url",
      "source_url",
      "confidence_score",
    ]) {
      expect(sparse[key]).toBeNull();
    }
  });

  it("passes explicit booleans through instead of re-defaulting them", () => {
    expect(sparse.is_permanent).toBe(true);
    expect(sparse.points_test_required).toBe(true);
  });

  it("leaves an already-serialised jsonb string alone", () => {
    const row = mapVisaDetails(visa({ work_rights: '{"hours":10}' }), "x", "y");
    expect(row.work_rights).toBe('{"hours":10}');
  });
});

describe("mapVisaToService — publish flag", () => {
  it("honours publish: false so a promote can land unpublished", () => {
    const { row } = mapVisaToService(visa(), { serviceCategoryId: null, publish: false });
    expect(row!.is_published).toBe(false);
    expect(row!.service_category_id).toBeNull();
  });
});

describe("mapMaraToOrg — sparse rows", () => {
  it("nulls the optional org columns rather than omitting them", () => {
    const row = mapMaraToOrg(agent({ website: null, office_state: null, office_city: null }));
    expect(row.website).toBeNull();
    expect(row.state).toBeNull();
    expect(row.city).toBeNull();
  });
});

describe("mapMaraDetails — sparse rows", () => {
  it("nulls every absent registration column", () => {
    const row = mapMaraDetails(
      agent({
        registration_status: null,
        registration_date: null,
        expiry_date: null,
        business_name: null,
        practice_areas: null,
        languages_spoken: null,
        office_country: null,
        office_state: null,
        office_city: null,
        source_url: null,
      }),
      { type: "business", id: 7 },
    );
    for (const key of [
      "registration_status",
      "registration_date",
      "expiry_date",
      "business_name",
      "practice_areas",
      "languages_spoken",
      "office_country",
      "office_state",
      "office_city",
      "source_url",
    ]) {
      expect(row[key]).toBeNull();
    }
    expect(row.org_type).toBe("business");
    expect(row.org_id).toBe(7);
  });
});

describe("mapMaraDetails", () => {
  const row = mapMaraDetails(agent(), { type: "institution", id: 42 });

  it("links the polymorphic org pair and the MARN", () => {
    expect(row).toMatchObject({ org_type: "institution", org_id: 42, marn: "MARN0001" });
  });

  // V1 copied the scraped contact details onto the public record. This is the
  // unit-level half of the leak test; the integration test asserts it end to end.
  it("publishes a registration record, never contact details", () => {
    for (const field of ["email", "phone", "office_address", "website", "confidence_score"]) {
      expect(Object.keys(row)).not.toContain(field);
    }
  });
});
