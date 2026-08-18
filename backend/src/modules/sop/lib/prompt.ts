// Prompt assembly — pure, so what the model is told is asserted in tests rather than
// hoped for.
//
// Structure carried from V1's sop-generate `buildSystemPrompt` +
// `antiHallucinationRules`: the four ground rules, the destination's compliance rules
// and length window from sop_config, the destination writing guide, and then the
// student's own material — the Zone A profile snapshot and the Zone B questionnaire
// answers. Nothing else. The rules exist because the alternative is a model inventing
// a research interest a visa officer will ask about.

import type { DocumentType } from "../consts.js";
import type { SopLimits } from "./analysis.js";

/** V1's DUAL_DOC_COUNTRIES: destinations whose SOP must show temporary study intent. */
const NO_MIGRATION_LANGUAGE = new Set(["AU", "CA", "IE", "NZ"]);

export interface CountryGuide {
  key_requirements: string[];
  dos: string[];
  donts: string[];
  common_refusal_reasons: string[];
  notes: string | null;
}

export interface PromptInput {
  countryCode: string;
  documentType: DocumentType;
  limits: SopLimits;
  complianceRules: Record<string, unknown>;
  guide: CountryGuide | null;
  profileSnapshot: Record<string, unknown>;
  answers: Array<{ question_key: string; answer: string | null }>;
}

export function antiHallucinationRules(countryCode: string): string {
  const rules = [
    "GROUND RULE: Only use facts present in the student context provided below. If a fact is not in the context, do not invent it.",
    "SPECIFICITY RULE: Every claim must reference a specific name, number, date, or place from the context.",
    "VOICE RULE: Write in first person from the student's perspective. Never write as if you are an AI, and never mention that you are an AI.",
    "COMPLIANCE RULE: Follow all country-specific rules defined in the Document Requirements section below. These override any general SOP best-practice you might otherwise apply.",
  ];
  if (NO_MIGRATION_LANGUAGE.has(countryCode)) {
    rules.push(
      "NO-MIGRATION-LANGUAGE RULE: Never use the words or phrases: migrate, settle, stay permanently, remain in the country, immigrate. This document must demonstrate genuine temporary study intent.",
    );
  }
  return rules.map((rule, i) => `${i + 1}. ${rule}`).join("\n");
}

function bulletList(label: string, items: readonly string[]): string {
  if (items.length === 0) return "";
  return `${label}:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

function lengthWindow(limits: SopLimits): string {
  const parts: string[] = [];
  if (limits.min_words !== null) parts.push(`at least ${limits.min_words} words`);
  if (limits.max_words !== null) parts.push(`at most ${limits.max_words} words`);
  if (limits.max_chars !== null) parts.push(`at most ${limits.max_chars} characters`);
  return parts.length > 0 ? `Length: ${parts.join(", ")}.` : "";
}

export function buildSystemPrompt(input: PromptInput): string {
  const sections: string[] = [
    "You are helping a student write their own statement of purpose. You are a writing assistant, not the author.",
    antiHallucinationRules(input.countryCode),
    [
      "## Document Requirements",
      `Destination: ${input.countryCode}`,
      `Document type: ${input.documentType}`,
      lengthWindow(input.limits),
      bulletList("Phrases that must not appear", input.limits.banned_phrases),
      Object.keys(input.complianceRules).length > 0
        ? `Compliance rules: ${JSON.stringify(input.complianceRules)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  ];

  if (input.guide) {
    sections.push(
      [
        "## Destination Guide",
        bulletList("Key requirements", input.guide.key_requirements),
        bulletList("Do", input.guide.dos),
        bulletList("Do not", input.guide.donts),
        bulletList("Common refusal reasons", input.guide.common_refusal_reasons),
        input.guide.notes ? `Notes: ${input.guide.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  sections.push(
    [
      "## Student Context",
      `Profile: ${JSON.stringify(input.profileSnapshot)}`,
      ...input.answers.map((a) => `${a.question_key}: ${a.answer ?? "(not answered)"}`),
    ].join("\n"),
  );

  return sections.filter(Boolean).join("\n\n");
}

/** V1's `stage1UserMessage`, per document type. */
export function draftInstruction(documentType: DocumentType): string {
  switch (documentType) {
    case "visa_sop":
      return "Write the visa statement of purpose now, using only the context above.";
    case "ucas_statement":
      return "Write the UCAS personal statement now, using only the context above. Respect the character limit exactly.";
    default:
      return "Write the university statement of purpose now, using only the context above.";
  }
}
