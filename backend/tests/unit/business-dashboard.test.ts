// Business dashboard projections — the allowlist that decides what a business
// user's landing page is allowed to see about their own tenant.
//
// The projection is the whole reason this file exists. `req.business` is a full
// `BusinessRecord`: it carries `claim_token`, `customer_id`, `subscription_id`,
// `owner_id`, `meta` and `deleted_at`. Sending that row is one `return business`
// away, and five endpoints in this program have already shipped exactly that
// mistake. So the assertions below are written negatively — the leak-shaped
// keys must be ABSENT — not "the good keys are present".

import { describe, expect, it } from "vitest";
import {
  buildDashboard,
  projectBusiness,
  projectMember,
} from "../../src/modules/businesses/services/dashboard.service.js";
import type { BusinessRecord } from "../../src/core/types.js";

/** A business row with every field the dashboard must NOT echo back. */
function businessRow(overrides: Partial<BusinessRecord> = {}): BusinessRecord {
  return {
    id: "42",
    business_name: "Acme Migration",
    subdomain: "acme",
    business_type: "agent",
    status: "pending",
    logo_url: "https://cdn.test/logo.png",
    verified_at: null,
    is_published: false,
    onboarding_completed: true,
    // ── everything below is internal and must never reach the client ──
    owner_id: 7,
    claim_token: "super-secret-claim-token",
    claim_token_expires_at: new Date("2030-01-01"),
    claim_status: "unclaimed",
    customer_id: "cus_live_123",
    subscription_id: "sub_live_123",
    plan_code: "growth",
    schema_name: "0d1e2f34-0000-0000-0000-000000000000",
    account_status: 1,
    meta: { internal_score: 9000 },
    deleted_at: null,
    ...overrides,
  } as unknown as BusinessRecord;
}

const LEAKY_KEYS = [
  "claim_token",
  "claim_token_expires_at",
  "customer_id",
  "subscription_id",
  "plan_code",
  "owner_id",
  "meta",
  "deleted_at",
  "account_status",
  "schema_name",
];

describe("projectBusiness", () => {
  it("emits only the allowlisted columns", () => {
    expect(Object.keys(projectBusiness(businessRow())).sort()).toEqual([
      "business_name",
      "business_type",
      "id",
      "is_published",
      "logo_url",
      "onboarding_completed",
      "status",
      "subdomain",
      "verified_at",
    ]);
  });

  it.each(LEAKY_KEYS)("never carries %s", (key) => {
    expect(projectBusiness(businessRow())).not.toHaveProperty(key);
  });

  it("narrows the id to a number — the column is a serial, the interface says string", () => {
    expect(projectBusiness(businessRow({ id: "42" }))).toMatchObject({ id: 42 });
  });

  it("does not mutate the row it projects", () => {
    const row = businessRow();
    const before = JSON.stringify(row);
    projectBusiness(row);
    expect(JSON.stringify(row)).toBe(before);
  });

  it("keeps a missing verification date as null rather than undefined", () => {
    expect(projectBusiness(businessRow({ verified_at: null })).verified_at).toBeNull();
  });

  it("carries a real verification date through", () => {
    const verified = new Date("2026-01-02T03:04:05.000Z");
    expect(projectBusiness(businessRow({ verified_at: verified })).verified_at).toBe(verified);
  });
});

describe("projectMember", () => {
  const agent = {
    id: 3,
    platform_user_id: 7,
    first_name: "Ada",
    last_name: "Lovelace",
    role: "owner",
    is_owner: true,
    email: "ada@internal.test",
    phone: "+61400000000",
    role_id: 1,
    meta: { note: "internal" },
  };

  it("emits only name, role and ownership", () => {
    expect(projectMember(agent)).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      role: "owner",
      is_owner: true,
    });
  });

  it.each(["email", "phone", "meta", "role_id", "platform_user_id"])("never carries %s", (key) => {
    expect(projectMember(agent)).not.toHaveProperty(key);
  });

  it("tolerates an agent row with no name on it", () => {
    expect(projectMember({ ...agent, first_name: null, last_name: null })).toMatchObject({
      first_name: null,
      last_name: null,
    });
  });

  it("reports a non-owner as such", () => {
    expect(projectMember({ ...agent, is_owner: false, role: "counsellor" })).toMatchObject({
      is_owner: false,
      role: "counsellor",
    });
  });
});

describe("buildDashboard", () => {
  const parts = {
    business: businessRow(),
    agent: { first_name: "Ada", last_name: "Lovelace", role: "owner", is_owner: true },
    balance: 120,
    enquiriesTotal: 3,
    enquiriesLocked: 2,
    recentEnquiries: [{ id: 1, unlocked: false }],
    servicesTotal: 5,
    servicesPublished: 4,
  };

  it("assembles the four V1 sources into one envelope", () => {
    expect(buildDashboard(parts)).toEqual({
      business: projectBusiness(parts.business),
      member: projectMember(parts.agent),
      credits: { balance: 120 },
      enquiries: { total: 3, locked: 2, recent: [{ id: 1, unlocked: false }] },
      services: { total: 5, published: 4 },
    });
  });

  it("reports a genuinely empty tenant as zeroes and an empty list, not as absent data", () => {
    const empty = buildDashboard({
      ...parts,
      balance: 0,
      enquiriesTotal: 0,
      enquiriesLocked: 0,
      recentEnquiries: [],
      servicesTotal: 0,
      servicesPublished: 0,
    });
    expect(empty.enquiries).toEqual({ total: 0, locked: 0, recent: [] });
    expect(empty.services).toEqual({ total: 0, published: 0 });
    expect(empty.credits.balance).toBe(0);
  });

  it("does not mutate the parts it was handed", () => {
    const recent = parts.recentEnquiries;
    const built = buildDashboard(parts);
    expect(built.enquiries.recent).not.toBe(recent);
    expect(recent).toHaveLength(1);
  });
});
