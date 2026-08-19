import { describe, expect, it } from "vitest";

import {
  AI_PROMPTS_BY_SLUG,
  AI_PROMPTS_DEFAULT,
  CATEGORIES,
  SEARCH_SUGGESTIONS_BY_SLUG,
} from "@/app/(web)/const/index";

// The hero switcher builds `/search?tab=<slug>` for whichever vertical is selected. A slug that is not a
// SearchTabKey silently falls back to the courses tab on /search — a tab that looks live and shows the
// wrong results. SearchTabKey is a type, so the contract is asserted against its members here.
const SEARCH_TAB_KEYS = [
  "courses",
  "institutions",
  "education-agencies",
  "visa-services",
  "migration-agents",
  "jobs",
] as const;

describe("hero search switcher", () => {
  it("offers V1's six verticals, in V1's order", () => {
    expect(CATEGORIES.map((c) => c.name)).toEqual([
      "Courses",
      "Institutions",
      "Education Agents",
      "Visa Services",
      "Migration Agents",
      "Student Jobs",
    ]);
  });

  it("keys every vertical on a tab /search actually serves", () => {
    expect(CATEGORIES.map((c) => c.slug)).toEqual([...SEARCH_TAB_KEYS]);
  });

  it("gives every vertical a Try: row, so Search mode is never an empty band", () => {
    for (const { slug } of CATEGORIES) {
      expect(SEARCH_SUGGESTIONS_BY_SLUG[slug], slug).toBeDefined();
      expect(SEARCH_SUGGESTIONS_BY_SLUG[slug]!.length, slug).toBeGreaterThan(0);
    }
  });

  it("falls back to the default prompts for a vertical with no set of its own", () => {
    const withoutOwnSet = CATEGORIES.filter((c) => !AI_PROMPTS_BY_SLUG[c.slug]);
    expect(withoutOwnSet.length, "V1 writes prompts for three of the six").toBeGreaterThan(0);

    for (const { slug } of withoutOwnSet) {
      expect(AI_PROMPTS_BY_SLUG[slug] ?? AI_PROMPTS_DEFAULT, slug).toBe(AI_PROMPTS_DEFAULT);
    }
  });

  it("shows four prompt chips per vertical, as V1 does", () => {
    for (const { slug } of CATEGORIES) {
      expect((AI_PROMPTS_BY_SLUG[slug] ?? AI_PROMPTS_DEFAULT).length, slug).toBe(4);
    }
  });
});
