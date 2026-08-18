// The counsellor's pure text handling: what it lifts out of a model's answer, and
// what it puts into a model's instructions.

import { describe, expect, it } from "vitest";

import { parseCards, parseChips, stripBlocks } from "../../src/modules/ai-counsellor/lib/card-parser.js";
import { buildSystemPrompt } from "../../src/modules/ai-counsellor/services/prompt.service.js";
import type { ProfileContext } from "../../src/modules/ai-counsellor/repositories/knowledge.repository.js";

const card = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ id: "c1", name: "BSc Computing", institution: "Test Uni", ...over });

const block = (kind: string, body: string) => "```" + kind + "\n" + body + "\n```";

describe("parseCards", () => {
  it("returns nothing when there is no card block", () => {
    expect(parseCards("Just prose.")).toEqual([]);
  });

  it("extracts every well-formed card in order", () => {
    const text = `intro\n${block("course-card", card())}\nmiddle\n${block("course-card", card({ id: "c2" }))}\n`;
    expect(parseCards(text).map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("skips malformed JSON rather than throwing", () => {
    const text = `${block("course-card", "{not json")}\n${block("course-card", card())}`;
    expect(parseCards(text).map((c) => c.id)).toEqual(["c1"]);
  });

  it("skips a card missing any of id, name or institution", () => {
    for (const missing of ["id", "name", "institution"]) {
      const body = JSON.parse(card());
      delete body[missing];
      expect(parseCards(block("course-card", JSON.stringify(body)))).toEqual([]);
    }
  });
});

describe("parseChips", () => {
  it("returns nothing when there is no chips block", () => {
    expect(parseChips("Just prose.")).toEqual([]);
  });

  it("extracts a string array", () => {
    expect(parseChips(block("chips", '["one", "two"]'))).toEqual(["one", "two"]);
  });

  it("drops non-string entries", () => {
    expect(parseChips(block("chips", '["one", 2, null, "three"]'))).toEqual(["one", "three"]);
  });

  it("returns nothing for malformed or non-array content", () => {
    expect(parseChips(block("chips", "[oops"))).toEqual([]);
    expect(parseChips(block("chips", '{"a":1}'))).toEqual([]);
  });
});

describe("stripBlocks", () => {
  it("leaves plain prose alone apart from trimming", () => {
    expect(stripBlocks("  hello  ")).toBe("hello");
  });

  it("removes both block kinds and keeps the prose around them", () => {
    const text = `Before\n${block("course-card", card())}\nAfter\n${block("chips", '["x"]')}`;
    const stripped = stripBlocks(text);
    expect(stripped).toContain("Before");
    expect(stripped).toContain("After");
    expect(stripped).not.toContain("course-card");
    expect(stripped).not.toContain("chips");
  });
});

describe("buildSystemPrompt", () => {
  const empty = { profile: null, ragContext: "", isFirstMessage: false };

  it("always states the identity and the no-invention rule", () => {
    const prompt = buildSystemPrompt(empty);
    expect(prompt).toContain("Globaly AI");
    expect(prompt).toContain("NEVER invent");
    expect(prompt).toContain("course-card");
    expect(prompt).toContain("chips");
  });

  it("omits the profile, context and greeting sections when there is nothing to say", () => {
    const prompt = buildSystemPrompt(empty);
    expect(prompt).not.toContain("STUDENT PROFILE");
    expect(prompt).not.toContain("CONTEXT:");
    expect(prompt).not.toContain("first message");
  });

  it("adds the retrieved context and the first-turn greeting when present", () => {
    const prompt = buildSystemPrompt({ profile: null, ragContext: "--- COURSES ---", isFirstMessage: true });
    expect(prompt).toContain("CONTEXT:\n--- COURSES ---");
    expect(prompt).toContain("first message");
  });

  it("renders every profile section it is given", () => {
    const profile: ProfileContext = {
      profile: {
        nationality: "Nepal",
        country_of_residence: "Australia",
        city_of_residence: "Sydney",
        date_of_birth: null,
        gender: null,
        degree_level: "Bachelor",
        individual_category: "student",
        preferred_destinations: ["AU", "NZ"],
        fields_of_study: null,
        budget_min: 20_000,
        budget_max: 40_000,
        budget_currency: "AUD",
        expected_start_date: "2027-02-01",
      } as ProfileContext["profile"],
      qualifications: [
        {
          degree_title: "BSc",
          institution_name: "Kathmandu Uni",
          subject_area: "CS",
          grading_system: "GPA",
          grade_value: "3.6",
        } as ProfileContext["qualifications"][number],
      ],
      language_tests: [{ test_type: "IELTS", overall_score: "7.5" } as ProfileContext["language_tests"][number]],
      work_experiences: [
        { job_title: "Analyst", organization_name: "Acme" } as ProfileContext["work_experiences"][number],
      ],
    };

    const prompt = buildSystemPrompt({ profile, ragContext: "", isFirstMessage: false });
    expect(prompt).toContain("STUDENT PROFILE");
    expect(prompt).toContain("Nationality: Nepal");
    expect(prompt).toContain("BSc, Kathmandu Uni, CS (GPA: 3.6)");
    expect(prompt).toContain("IELTS: 7.5");
    expect(prompt).toContain("Analyst at Acme");
    expect(prompt).toContain("Budget: AUD 20000 – 40000");
    expect(prompt).toContain("Expected Start: 2027-02-01");
  });

  it("never leaks the profile section for a user with no profile row", () => {
    const prompt = buildSystemPrompt({
      profile: { profile: null, qualifications: [], language_tests: [], work_experiences: [] },
      ragContext: "",
      isFirstMessage: false,
    });
    expect(prompt).not.toContain("STUDENT PROFILE");
  });
});
