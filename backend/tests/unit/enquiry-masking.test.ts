// The two pure decisions in the enquiry module: what a lead costs, and which
// fields a business may see before it has paid. Both are asserted here without a
// database, because both are the kind of thing a careless refactor silently
// widens.

import { describe, expect, it } from "vitest";
import { toInboxItem } from "../../src/modules/enquiries/services/enquiries.service.js";
import { priceLead } from "../../src/modules/enquiries/services/distribution.service.js";
import { DEFAULT_COIN_COST, MIN_COIN_COST } from "../../src/modules/enquiries/consts.js";
import type { InboxRow } from "../../src/modules/enquiries/repositories/enquiries.repository.js";

const CONTACT_KEYS = ["email", "phone", "last_name", "id"] as const;

function row(overrides: Partial<InboxRow> = {}): InboxRow {
  return {
    id: 1,
    enquiry_id: 2,
    coin_cost: 30,
    distance_km: "12.50",
    status: "pending",
    created_at: new Date("2026-08-17T00:00:00Z"),
    message: "Hello, I would like to study nursing.",
    preferred_intake: "October",
    preferred_year: 2027,
    service_id: null,
    target_org_type: null,
    target_org_id: null,
    enquiry_status: "pending",
    student_id: 7,
    student_first_name: "Aarav",
    student_last_name: "Sharma",
    student_email: "aarav@example.com",
    student_phone: "+61400000000",
    student_photo_url: null,
    student_city: "Sydney",
    student_nationality_id: 4,
    student_country_of_residence_id: 12,
    unlock_id: null,
    credits_spent: null,
    unlocked_at: null,
    ...overrides,
  };
}

describe("toInboxItem", () => {
  it("omits contact keys entirely on a locked lead", () => {
    const item = toInboxItem(row()) as Record<string, unknown>;
    const student = item.student as Record<string, unknown>;

    expect(item.unlocked).toBe(false);
    expect(Object.keys(item)).not.toContain("message");
    for (const key of CONTACT_KEYS) expect(Object.keys(student)).not.toContain(key);
    // Nothing sensitive is smuggled through another field either.
    const serialized = JSON.stringify(item);
    expect(serialized).not.toContain("aarav@example.com");
    expect(serialized).not.toContain("+61400000000");
    expect(serialized).not.toContain("Sharma");
  });

  it("truncates the preview but keeps a short message whole", () => {
    const short = toInboxItem(row({ message: "Hi" })) as Record<string, unknown>;
    expect(short.message_preview).toBe("Hi");

    const long = toInboxItem(row({ message: "x".repeat(500) })) as Record<string, unknown>;
    const preview = long.message_preview as string;
    expect(preview.length).toBeLessThan(500);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("reveals the full lead once it is unlocked", () => {
    const item = toInboxItem(
      row({ unlock_id: 9, credits_spent: 30, unlocked_at: new Date("2026-08-17T01:00:00Z") }),
    ) as Record<string, unknown>;
    const student = item.student as Record<string, unknown>;

    expect(item.unlocked).toBe(true);
    expect(item.message).toBe("Hello, I would like to study nursing.");
    expect(item.credits_spent).toBe(30);
    expect(Object.keys(item)).not.toContain("message_preview");
    expect(student.email).toBe("aarav@example.com");
    expect(student.phone).toBe("+61400000000");
    expect(student.last_name).toBe("Sharma");
  });

  it("returns distance as a number, not the numeric string pg hands back", () => {
    expect(toInboxItem(row()).distance_km).toBe(12.5);
    expect(toInboxItem(row({ distance_km: null })).distance_km).toBeNull();
  });
});

describe("priceLead", () => {
  it("uses the recipient's own configured cost", () => {
    expect(priceLead(45)).toBe(45);
  });

  it("falls back to the V1 default when the business has no cost set", () => {
    expect(priceLead(null)).toBe(DEFAULT_COIN_COST);
    expect(priceLead(undefined)).toBe(DEFAULT_COIN_COST);
    expect(priceLead(0)).toBe(DEFAULT_COIN_COST);
  });

  it("never prices a lead below the floor", () => {
    expect(priceLead(1)).toBe(MIN_COIN_COST);
    expect(priceLead(-5)).toBe(DEFAULT_COIN_COST);
  });
});
