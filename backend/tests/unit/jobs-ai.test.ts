// The fail-closed seam and the match-score parser, with no network and no key.
//
// V1's job-match-score answered 200 with a made-up {label, score} whenever the key
// was missing OR the gateway failed OR the JSON did not parse. Each of those is a
// separate assertion here, and all three must refuse rather than invent.

import { afterEach, describe, expect, it } from "vitest";

import { config } from "../../src/config.js";
import { AiUnavailableError, assertConfigured, isConfigured } from "../../src/shared/ai/gemini.js";
import { buildMatchPrompt, parseMatchScore } from "../../src/modules/jobs/services/job-ai.service.js";
import type { JobRow } from "../../src/modules/jobs/repositories/jobs.repository.js";
import { BadRequestError } from "../../src/shared/errors.js";

const mutableConfig = config as unknown as Record<string, unknown>;

afterEach(() => {
  delete mutableConfig.GEMINI_API_KEY;
});

describe("AI seam fail-closed", () => {
  it("reports itself unconfigured with no key", () => {
    delete mutableConfig.GEMINI_API_KEY;
    expect(isConfigured()).toBe(false);
  });

  it("throws a 503, not a 400 — the request was fine, the deployment is not", () => {
    delete mutableConfig.GEMINI_API_KEY;
    expect(() => assertConfigured()).toThrow(AiUnavailableError);
    try {
      assertConfigured();
    } catch (err) {
      expect((err as AiUnavailableError).statusCode).toBe(503);
    }
  });

  it("passes once a key is present", () => {
    mutableConfig.GEMINI_API_KEY = "test-key";
    expect(isConfigured()).toBe(true);
    expect(() => assertConfigured()).not.toThrow();
  });
});

describe("parseMatchScore", () => {
  it("reads the JSON V1's prompt asks for", () => {
    const parsed = parseMatchScore(
      '{"label": "Strong Match", "score": 88, "reasons": ["visa fits", "skills match", "same city"]}',
    );
    expect(parsed).toEqual({
      label: "Strong Match",
      score: 88,
      reasons: ["visa fits", "skills match", "same city"],
    });
  });

  it("tolerates prose around the JSON, as V1's regex did", () => {
    const parsed = parseMatchScore(
      'Here is the result:\n```json\n{"label": "Stretch", "score": 30, "reasons": []}\n```',
    );
    expect(parsed.label).toBe("Stretch");
    expect(parsed.score).toBe(30);
  });

  it("caps the reasons list", () => {
    const reasons = JSON.stringify(["a", "b", "c", "d", "e", "f", "g"]);
    const parsed = parseMatchScore(`{"label":"Good Match","score":50,"reasons":${reasons}}`);
    expect(parsed.reasons).toHaveLength(5);
  });

  it("coerces a missing reasons array to empty rather than throwing", () => {
    expect(parseMatchScore('{"label":"Good Match","score":50}').reasons).toEqual([]);
  });

  it.each([
    ["no JSON at all", "The model apologises and says nothing useful."],
    ["malformed JSON", "{label: Good Match, score: 50"],
    ["a label outside the vocabulary", '{"label":"Perfect","score":99,"reasons":[]}'],
    ["a non-numeric score", '{"label":"Good Match","score":"very high","reasons":[]}'],
    ["a score above 100", '{"label":"Good Match","score":140,"reasons":[]}'],
    ["a negative score", '{"label":"Good Match","score":-5,"reasons":[]}'],
  ])("refuses %s instead of defaulting to 50", (_label, text) => {
    expect(() => parseMatchScore(text)).toThrow(BadRequestError);
  });
});

describe("buildMatchPrompt", () => {
  const job = {
    title: "Barista",
    job_type: "part_time",
    location_city: "Sydney",
    country_name: "Australia",
    is_remote: false,
    category: "hospitality",
    skill_tags: ["coffee", "customer service"],
    work_rights_required: true,
    visa_types_allowed: ["subclass_500"],
  } as unknown as JobRow;

  it("carries every field V1's job-match-score prompt named", () => {
    const prompt = buildMatchPrompt(job, {
      nationality_name: "India",
      residence_name: "Australia",
      city_of_residence: "Sydney",
      highest_degree_level: "Bachelor",
      fields_of_study: [{ name: "Law" }],
    });
    expect(prompt).toContain("- Title: Barista");
    expect(prompt).toContain("- Location: Sydney, Australia");
    expect(prompt).toContain("- Skills: coffee, customer service");
    expect(prompt).toContain("- Work rights required: true");
    expect(prompt).toContain("- Visa types allowed: subclass_500");
    expect(prompt).toContain("- Nationality: India");
    expect(prompt).toContain("- Highest degree: Bachelor");
    expect(prompt).toContain('"label": "Strong Match" | "Good Match" | "Stretch"');
  });

  it("says 'unknown' for an empty profile rather than leaking 'null' into the prompt", () => {
    const prompt = buildMatchPrompt(job, {});
    expect(prompt).toContain("- Nationality: unknown");
    expect(prompt).toContain("- Country of residence: unknown");
    expect(prompt).toContain("- City: unknown");
    expect(prompt).toContain("- Highest degree: unknown");
    expect(prompt).not.toContain("null");
  });

  it("defaults a job with no category or tags without throwing", () => {
    const bare = {
      ...job,
      category: null,
      skill_tags: null,
      visa_types_allowed: null,
    } as unknown as JobRow;
    const prompt = buildMatchPrompt(bare, {});
    expect(prompt).toContain("- Category: general");
    expect(prompt).toContain("- Skills: ");
  });

  it("truncates a hostile title instead of forwarding it whole", () => {
    const long = { ...job, title: "x".repeat(5000) } as unknown as JobRow;
    const prompt = buildMatchPrompt(long, {});
    expect(prompt).toContain(`- Title: ${"x".repeat(200)}\n`);
  });
});
