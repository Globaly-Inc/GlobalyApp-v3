// The eight V3-only service verticals (§3.4's last gap row): the pure mapping
// layer that turns a staged vertical row into a live tenant `business_services`
// row.
//
// There is NO upstream contract here — these tables exist in neither V1 nor V2 —
// so the spec under test is the behaviour of V3's existing extraction verticals,
// specifically lib/immigration-mappers.ts (Wave G1):
//
//   * pure functions, no database and no clock, so the mapping rules are testable
//     without a Postgres;
//   * `extraction_source_id` on every promoted row as the idempotency key;
//   * a staged row that cannot become an addressable service returns a reason
//     instead of throwing;
//   * scraped CONTACT PII stays in staging and never reaches the live row —
//     mapMaraDetails enforces exactly that boundary and visas.test.ts asserts it
//     from the outside.

import { describe, expect, it } from "vitest";

import {
  SERVICE_VERTICALS,
  VERTICAL_SLUGS,
  mapVerticalToService,
  summaryColumnsFor,
  verticalSpec,
} from "../../src/modules/superadmin/data-extraction/lib/service-verticals.js";

/** The whitelist jobs.repository.ts already carries, which is the tables' only contract. */
const WHITELISTED_TABLES = [
  "extraction_accommodation",
  "extraction_banking",
  "extraction_career_services",
  "extraction_insurance",
  "extraction_test_preparation",
  "extraction_translation",
  "extraction_transport",
  "extraction_visa_services",
];

/**
 * Contact details the staging row holds and a published catalog row must never
 * carry. Same boundary MARA_PII_FIELDS asserts in visas.test.ts: the live row is
 * public, the staging row is not.
 */
const CONTACT_PII = [
  "contact_name",
  "contact_email",
  "contact_phone",
  "contact_whatsapp",
  "claims_email",
  "claims_phone",
];

function stagedRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    job_id: "99999999-8888-7777-6666-555555555555",
    status: "pending",
    promoted_service_id: null,
    name: "  Sunnyside Student Living  ",
    provider_name: "Sunnyside Group",
    type: "student_housing",
    description: "Purpose-built student accommodation near campus.",
    city: "Sydney",
    country_code: "AU",
    website: "https://sunnyside.example/live",
    price_amount: "320.50",
    price_currency: "AUD",
    price_period: "per_week",
    contact_name: "Jane Landlord",
    contact_email: "jane@sunnyside.example",
    contact_phone: "+61400000000",
    contact_whatsapp: "+61400000000",
    source_url: "https://sunnyside.example/live",
    confidence_score: "0.87",
    raw_payload: { scraped: "everything" },
    created_at: new Date("2026-08-01T00:00:00Z"),
    updated_at: new Date("2026-08-01T00:00:00Z"),
    ...over,
  };
}

describe("service vertical registry", () => {
  it("covers exactly the eight whitelisted staging tables", () => {
    expect(SERVICE_VERTICALS.map((v) => v.table).sort()).toEqual(WHITELISTED_TABLES);
  });

  it("keys every vertical on its public.service_categories slug", () => {
    // serviceTableForSlug() in jobs.repository.ts derives the staging table from
    // the category slug; the two must agree or a service job stages nowhere.
    for (const spec of SERVICE_VERTICALS) {
      expect(spec.table).toBe(`extraction_${spec.slug.replaceAll("-", "_")}`);
    }
    expect(VERTICAL_SLUGS).toHaveLength(8);
  });

  it("resolves a known slug and rejects anything else", () => {
    expect(verticalSpec("accommodation")?.table).toBe("extraction_accommodation");
    expect(verticalSpec("test_preparation")?.typeColumn).toBe("test_type");
    expect(verticalSpec("extraction_jobs")).toBeNull();
    expect(verticalSpec("accommodation; drop table x")).toBeNull();
    expect(verticalSpec("")).toBeNull();
  });

  it("names the type column each table actually has", () => {
    // Seven tables call it `type`; extraction_test_preparation calls it
    // `test_type`, so a shared column list would select a column that is not there.
    const byType = SERVICE_VERTICALS.filter((v) => v.typeColumn === "type");
    expect(byType).toHaveLength(7);
    expect(verticalSpec("test_preparation")!.typeColumn).toBe("test_type");
  });

  it("lists summary columns explicitly, never a wildcard", () => {
    const columns = summaryColumnsFor(verticalSpec("insurance")!);
    expect(columns).not.toContain("*");
    expect(columns).toContain("id");
    expect(columns).toContain("status");
    expect(columns).toContain("premium_amount");
    // raw_payload is scraper noise and can be megabytes — never in a list read.
    expect(columns).not.toContain("raw_payload");
  });
});

describe("mapVerticalToService", () => {
  const accommodation = verticalSpec("accommodation")!;

  it("maps identity, price and the idempotency key", () => {
    const { row } = mapVerticalToService(accommodation, stagedRow(), {
      serviceCategoryId: 31,
      publish: true,
    });

    expect(row).toMatchObject({
      name: "Sunnyside Student Living",
      description: "Purpose-built student accommodation near campus.",
      overview: "Purpose-built student accommodation near campus.",
      service_category_id: 31,
      is_published: true,
      is_featured: false,
      price: 320.5,
      price_currency: "AUD",
      price_type: "per_week",
      extraction_source_id: "11111111-2222-3333-4444-555555555555",
    });
  });

  it("refuses a staged row with no usable name instead of throwing", () => {
    const { row, reason } = mapVerticalToService(accommodation, stagedRow({ name: "   " }), {
      serviceCategoryId: null,
      publish: false,
    });
    expect(row).toBeNull();
    expect(reason).toMatch(/name/i);
  });

  it("keeps the vertical's own fields in category_specific_data", () => {
    const { row } = mapVerticalToService(accommodation, stagedRow(), {
      serviceCategoryId: null,
      publish: false,
    });
    const extra = JSON.parse(row!.category_specific_data as string) as Record<string, unknown>;

    expect(extra.type).toBe("student_housing");
    expect(extra.city).toBe("Sydney");
    expect(extra.provider_name).toBe("Sunnyside Group");
    expect(extra.website).toBe("https://sunnyside.example/live");
    // Provenance travels with the promoted row, as visa_service_details does.
    expect(extra.source_url).toBe("https://sunnyside.example/live");
    expect(extra.confidence_score).toBe("0.87");
  });

  it("never copies scraped contact PII onto the live row", () => {
    const { row } = mapVerticalToService(accommodation, stagedRow(), {
      serviceCategoryId: null,
      publish: true,
    });
    const serialized = JSON.stringify(row);

    for (const field of CONTACT_PII) expect(serialized).not.toContain(field);
    expect(serialized).not.toContain("jane@sunnyside.example");
    expect(serialized).not.toContain("+61400000000");
  });

  it("drops the administrative columns and the raw scraper payload", () => {
    const { row } = mapVerticalToService(accommodation, stagedRow(), {
      serviceCategoryId: null,
      publish: false,
    });
    const extra = JSON.parse(row!.category_specific_data as string) as Record<string, unknown>;

    for (const key of ["id", "job_id", "status", "promoted_service_id", "raw_payload", "created_at", "updated_at"]) {
      expect(extra).not.toHaveProperty(key);
    }
    // The columns the live row carries in its own typed slots are not duplicated.
    for (const key of ["name", "description", "price_amount", "price_currency", "price_period"]) {
      expect(extra).not.toHaveProperty(key);
    }
  });

  it("omits nulls rather than writing eighty of them into jsonb", () => {
    const { row } = mapVerticalToService(
      accommodation,
      stagedRow({ city: null, country_code: null, type: undefined }),
      { serviceCategoryId: null, publish: false },
    );
    const extra = JSON.parse(row!.category_specific_data as string) as Record<string, unknown>;

    expect(extra).not.toHaveProperty("city");
    expect(extra).not.toHaveProperty("country_code");
    expect(extra).not.toHaveProperty("type");
  });

  it("leaves price null when the vertical has no single price", () => {
    // A bank account has a monthly fee, an annual fee and a dozen transaction
    // fees — no one of them is "the price", so banking maps none of them up and
    // they all stay in category_specific_data.
    const banking = verticalSpec("banking")!;
    expect(banking.price).toBeNull();

    const { row } = mapVerticalToService(
      banking,
      { id: "b1", name: "Student Everyday Account", monthly_fee: "0", annual_fee: "12", fee_currency: "AUD" },
      { serviceCategoryId: null, publish: false },
    );
    expect(row!.price).toBeNull();
    expect(row!.price_currency).toBeNull();

    const extra = JSON.parse(row!.category_specific_data as string) as Record<string, unknown>;
    expect(extra.monthly_fee).toBe("0");
    expect(extra.annual_fee).toBe("12");
  });

  it("falls back to a fixed price type when the vertical has no period column", () => {
    const insurance = verticalSpec("insurance")!;
    const { row } = mapVerticalToService(
      insurance,
      { id: "i1", name: "OSHC Single", premium_amount: 620, premium_currency: "AUD", premium_period: null },
      { serviceCategoryId: null, publish: false },
    );
    expect(row!.price).toBe(620);
    expect(row!.price_type).toBe("fixed");
  });

  it("rejects a non-numeric price rather than writing NaN to a numeric column", () => {
    const { row } = mapVerticalToService(accommodation, stagedRow({ price_amount: "on application" }), {
      serviceCategoryId: null,
      publish: false,
    });
    expect(row!.price).toBeNull();
  });
});
