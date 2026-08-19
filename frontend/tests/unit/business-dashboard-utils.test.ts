// Business portal dashboard — the pure decisions behind the rendered screen.
//
// Every branch the dashboard makes about what to SHOW lives here rather than in
// JSX, for the reason vitest.config.mts already gives: these are the assertions
// worth making, and asserting them through a DOM would prove the same thing
// three dependencies later.
//
// The load-bearing one is `leadHeadline`. A locked lead must never render as if
// it were unlocked, and the type is a discriminated union precisely so that is a
// compile error — but the runtime copy still has to be right, because "no
// enquiries yet" and "a lead exists but you have not paid for it" are different
// facts and the screen must not blur them.

import { describe, expect, it } from "vitest";
import { LOW_CREDIT_THRESHOLD } from "@/app/business/portal/const";
import {
  formatCount,
  greeting,
  isCreditBalanceLow,
  leadHeadline,
  memberFirstName,
  needsVerification,
} from "@/app/business/portal/utils";
import type { InboxItem } from "@/app/business/enquiries/apis/types";

const lockedLead: InboxItem = {
  id: 1,
  enquiry_id: 11,
  status: "pending",
  enquiry_status: "pending",
  coin_cost: 30,
  distance_km: null,
  preferred_intake: null,
  preferred_year: null,
  created_at: "2026-08-01T00:00:00.000Z",
  closed_at: null,
  close_reason: null,
  unlocked: false,
  message_preview: "I would like help applying for a masters",
  student: { first_name: "Stu", photo_url: null },
};

const unlockedLead: InboxItem = {
  ...lockedLead,
  id: 2,
  unlocked: true,
  unlocked_at: "2026-08-02T00:00:00.000Z",
  credits_spent: 30,
  message: "Full message, contact details and all.",
  service_id: null,
  student: {
    id: 9,
    first_name: "Stu",
    last_name: "Dent",
    email: "stu@example.test",
    phone: null,
    photo_url: null,
    city_of_residence: null,
    nationality_id: null,
    country_of_residence_id: null,
  },
};

describe("greeting", () => {
  it.each([
    [0, "Good morning"],
    [11, "Good morning"],
    [12, "Good afternoon"],
    [16, "Good afternoon"],
    [17, "Good evening"],
    [23, "Good evening"],
  ])("hour %i reads %s", (hour, expected) => {
    expect(greeting(hour)).toBe(expected);
  });
});

describe("memberFirstName", () => {
  it("uses the first name when there is one", () => {
    expect(memberFirstName({ first_name: "Ada", last_name: "Lovelace" })).toBe("Ada");
  });

  it("returns null rather than an empty greeting fragment", () => {
    expect(memberFirstName({ first_name: null, last_name: "Lovelace" })).toBeNull();
    expect(memberFirstName({ first_name: "   ", last_name: null })).toBeNull();
  });

  it("trims a padded name", () => {
    expect(memberFirstName({ first_name: "  Ada  ", last_name: null })).toBe("Ada");
  });
});

describe("isCreditBalanceLow", () => {
  it("flags a balance under the threshold", () => {
    expect(isCreditBalanceLow(LOW_CREDIT_THRESHOLD - 1)).toBe(true);
    expect(isCreditBalanceLow(0)).toBe(true);
  });

  it("does not flag the threshold itself or above", () => {
    expect(isCreditBalanceLow(LOW_CREDIT_THRESHOLD)).toBe(false);
    expect(isCreditBalanceLow(LOW_CREDIT_THRESHOLD + 1)).toBe(false);
  });
});

describe("needsVerification", () => {
  it("is true only for a pending business", () => {
    expect(needsVerification("pending")).toBe(true);
    expect(needsVerification("active")).toBe(false);
    expect(needsVerification("suspended")).toBe(false);
  });
});

describe("formatCount", () => {
  it("formats with the locale's grouping", () => {
    expect(formatCount(1234)).toBe(new Intl.NumberFormat().format(1234));
  });

  it("renders a real zero as 0, never as a dash or a blank", () => {
    expect(formatCount(0)).toBe("0");
  });
});

describe("leadHeadline", () => {
  it("shows the server-truncated preview for a locked lead", () => {
    expect(leadHeadline(lockedLead)).toBe("I would like help applying for a masters");
  });

  it("shows the full message once the lead is paid for", () => {
    expect(leadHeadline(unlockedLead)).toBe("Full message, contact details and all.");
  });

  it("says so plainly when a locked lead carries no preview at all", () => {
    expect(leadHeadline({ ...lockedLead, message_preview: "" })).toBe("Locked — unlock to read");
  });

  it("says so plainly when an unlocked lead carries no message", () => {
    expect(leadHeadline({ ...unlockedLead, message: "   " })).toBe("No message");
  });
});
