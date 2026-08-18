// SOP reference data — per-destination generation rules and writing guidance.
//
// Carried verbatim from V1's supabase/migrations/20260701101635_ai_sop_generator.sql
// seed block (§1.2.1: a V1 feature's content is part of the feature). It is real
// product content, not placeholders, and it is what makes the prompt destination-aware
// and the compliance check meaningful — without it `documentTypesForCountry` has
// nothing to answer with and every draft is validated against no limits at all.
//
// Seeded in the migration rather than database/seeds/ on purpose: this is
// structural reference data the generator cannot run without, so it must exist in
// every rebuilt database — including the integration-test one, whose global setup
// runs only the countries seeder.
//
// Idempotent: onConflict().merge() on both natural keys, so a re-run updates rather
// than duplicating and a second `migrate:latest` on an already-seeded database is a
// no-op in effect.

import type { Knex } from "knex";

const BANNED_COMMON = ["I am writing to express my interest", "since a young age"];
const BANNED_PASSION = [...BANNED_COMMON, "passion for"];
const BANNED_VISA = [...BANNED_COMMON, "guaranteed visa"];

interface ConfigSeed {
  country_code: string;
  document_type: string;
  min_words: number | null;
  max_words: number | null;
  max_chars: number | null;
  banned_phrases: string[];
  compliance_rules: Record<string, unknown>;
}

const CONFIG: ConfigSeed[] = [
  {
    country_code: "AU", document_type: "university_sop",
    min_words: 500, max_words: 1000, max_chars: null, banned_phrases: BANNED_PASSION,
    compliance_rules: {
      genuine_temporary_entrant: true,
      financial_capacity_note:
        "Must demonstrate funds covering tuition + living costs (AUD 24,505/yr indicative)",
    },
  },
  {
    country_code: "AU", document_type: "visa_sop",
    min_words: 500, max_words: 1000, max_chars: null, banned_phrases: BANNED_VISA,
    compliance_rules: {
      gte_statement_required: true,
      home_ties_required: true,
      financial_capacity_note: "AUD 24,505/yr indicative living cost threshold",
    },
  },
  {
    country_code: "CA", document_type: "university_sop",
    min_words: 400, max_words: 900, max_chars: null, banned_phrases: BANNED_COMMON,
    compliance_rules: { study_plan_required: true },
  },
  {
    country_code: "CA", document_type: "visa_sop",
    min_words: 400, max_words: 900, max_chars: null, banned_phrases: BANNED_VISA,
    compliance_rules: {
      dual_intent_disclosure_required: true,
      financial_capacity_note:
        "CAD 20,635/yr indicative (outside Quebec), proof of funds mandatory",
      home_ties_required: true,
    },
  },
  {
    country_code: "IE", document_type: "university_sop",
    min_words: 400, max_words: 800, max_chars: null, banned_phrases: BANNED_COMMON,
    compliance_rules: { study_plan_required: true },
  },
  {
    country_code: "IE", document_type: "visa_sop",
    min_words: 400, max_words: 800, max_chars: null, banned_phrases: BANNED_VISA,
    compliance_rules: {
      home_ties_required: true,
      financial_capacity_note: "EUR 10,000/yr indicative living cost threshold",
    },
  },
  {
    country_code: "NZ", document_type: "university_sop",
    min_words: 400, max_words: 800, max_chars: null, banned_phrases: BANNED_COMMON,
    compliance_rules: { study_plan_required: true },
  },
  {
    country_code: "NZ", document_type: "visa_sop",
    min_words: 400, max_words: 800, max_chars: null, banned_phrases: BANNED_VISA,
    compliance_rules: {
      home_ties_required: true,
      financial_capacity_note: "NZD 20,000/yr indicative living cost threshold",
    },
  },
  {
    country_code: "US", document_type: "university_sop",
    min_words: 500, max_words: 1000, max_chars: null, banned_phrases: BANNED_PASSION,
    compliance_rules: {
      ds160_consistency_check: true,
      note: "Personal statement, not visa-specific; SEVIS/I-20 consistency matters at interview stage",
    },
  },
  {
    country_code: "UK", document_type: "ucas_statement",
    min_words: null, max_words: null, max_chars: 4000, banned_phrases: BANNED_PASSION,
    compliance_rules: {
      ucas_line_limit: 47,
      ucas_char_limit: 4000,
      note: "UCAS enforces both a 4000 character limit and a 47 line soft limit",
    },
  },
  {
    country_code: "DE", document_type: "university_sop",
    min_words: 400, max_words: 800, max_chars: null, banned_phrases: BANNED_COMMON,
    compliance_rules: {
      motivation_letter_format: true,
      financial_capacity_note:
        "Blocked account requirement (Sperrkonto), approx EUR 11,904/yr",
    },
  },
  {
    country_code: "FR", document_type: "university_sop",
    min_words: 400, max_words: 800, max_chars: null, banned_phrases: BANNED_COMMON,
    compliance_rules: {
      campus_france_alignment_required: true,
      note: "Must align with Campus France / Etudes en France project",
    },
  },
  {
    country_code: "NL", document_type: "university_sop",
    min_words: 400, max_words: 800, max_chars: null, banned_phrases: BANNED_COMMON,
    compliance_rules: { motivation_letter_format: true },
  },
];

interface GuideSeed {
  country_code: string;
  key_requirements: string[];
  dos: string[];
  donts: string[];
  common_refusal_reasons: string[];
  notes: string;
}

const GUIDES: GuideSeed[] = [
  {
    country_code: "AU",
    key_requirements: [
      "Demonstrate Genuine Temporary Entrant (GTE) intent",
      "Show clear study-to-career pathway",
      "Evidence sufficient financial capacity",
    ],
    dos: [
      "Reference specific course units and faculty",
      "Explain why Australia over other destinations",
      "Show ties to home country (family, career, property)",
    ],
    donts: [
      "Do not imply intent to stay permanently",
      "Avoid generic praise of Australia without specifics",
      "Do not omit gaps in education/employment history",
    ],
    common_refusal_reasons: [
      "Weak GTE evidence",
      "Insufficient financial proof",
      "Course/career mismatch",
      "Unexplained study gaps",
    ],
    notes: "Subclass 500 student visa; GTE requirement is the single biggest refusal driver.",
  },
  {
    country_code: "CA",
    key_requirements: [
      "Clear study plan tied to Designated Learning Institution (DLI)",
      "Proof of funds (GIC or equivalent)",
      "Evidence of intent to leave Canada after studies",
    ],
    dos: [
      "Name the specific program and DLI number",
      "Explain career plans in home country post-graduation",
      "Address any prior visa refusals directly",
    ],
    donts: [
      "Do not overstate intent to immigrate/work permanently",
      "Avoid vague career goals",
      "Do not ignore financial gaps",
    ],
    common_refusal_reasons: [
      "Insufficient proof of funds",
      "Weak home ties",
      "Unclear study plan",
      "Prior refusal not addressed",
    ],
    notes:
      'Study permit; IRCC weighs "dual intent" carefully — plans to later immigrate are allowed but must be framed correctly.',
  },
  {
    country_code: "IE",
    key_requirements: [
      "Genuine student status",
      "Evidence of funds (EUR 10,000+/yr indicative)",
      "Private medical insurance",
    ],
    dos: [
      "Explain choice of Irish institution specifically",
      "Show academic progression logic",
      "Reference post-study work rights appropriately",
    ],
    donts: [
      "Do not suggest primary motive is EU work access",
      "Avoid unexplained employment gaps",
    ],
    common_refusal_reasons: [
      "Insufficient funds evidence",
      "Weak academic progression",
      "Doubts about genuine student intent",
    ],
    notes: "Non-EEA student visa (Irish Naturalisation and Immigration Service).",
  },
  {
    country_code: "NZ",
    key_requirements: [
      "Genuine intent to study (Genuine Student requirement)",
      "Sufficient funds (NZD 20,000/yr indicative)",
      "Acceptable accommodation plan",
    ],
    dos: [
      "Connect course choice to career outcomes at home",
      "Show financial evidence clearly sourced",
      "Address ties to home country",
    ],
    donts: [
      "Do not overstate work/residency intentions",
      "Avoid copy-paste generic statements about New Zealand",
    ],
    common_refusal_reasons: [
      "Weak genuine student evidence",
      "Insufficient or unclear funds",
      "Course level mismatch with prior study",
    ],
    notes:
      "Fee Paying Student Visa; Immigration New Zealand scrutinizes genuine intent closely.",
  },
  {
    country_code: "US",
    key_requirements: [
      "Consistency with SEVIS Form I-20",
      "Clear academic and career rationale",
      "Evidence of intent to return home (for F-1 visa interview, separate from SOP)",
    ],
    dos: [
      "Be specific about program fit and faculty/research interests",
      "Show a coherent narrative connecting past experience to program",
      "Keep it personal and reflective, not a resume restatement",
    ],
    donts: [
      "Do not pad with generic statements",
      "Avoid contradicting information on the DS-160 or I-20",
      "Do not exceed the expected 500-1000 word range",
    ],
    common_refusal_reasons: [
      "Weak or generic personal statement",
      "Inconsistency with visa interview answers",
      "Unclear ties to home country (at interview, not SOP itself)",
    ],
    notes:
      "Personal Statement / SOP used for admissions; F-1 visa interview is a separate but related risk point.",
  },
  {
    country_code: "UK",
    key_requirements: [
      "UCAS personal statement within 4000 characters / 47 lines",
      "Demonstrate subject knowledge and motivation",
      "Show relevant extracurricular/work experience",
    ],
    dos: [
      "Lead with genuine motivation for the subject",
      "Use specific examples of relevant coursework or projects",
      "Keep structure tight given the strict length limit",
    ],
    donts: [
      "Do not exceed the UCAS character/line limit (will be auto-truncated)",
      'Avoid cliche openings ("From a young age...")',
      "Do not just list achievements without reflection",
    ],
    common_refusal_reasons: [
      "Generic or unfocused statement",
      "Poor subject alignment",
      "Overly resume-like with no reflection",
    ],
    notes:
      "UCAS Personal Statement — one statement shared across all UK university choices, not a visa document itself.",
  },
  {
    country_code: "DE",
    key_requirements: [
      "Motivation letter aligned with program (esp. for Uni-Assist/DAAD applications)",
      "Evidence of language proficiency where required",
      "Financial proof via blocked account (Sperrkonto)",
    ],
    dos: [
      "Explain specific reasons for choosing the German institution/program",
      "Reference relevant prior coursework or thesis work",
      "Show clear post-study plans",
    ],
    donts: [
      "Do not overstate spoken German proficiency if not evidenced",
      "Avoid vague motivation not tied to the specific program",
    ],
    common_refusal_reasons: [
      "Weak program fit",
      "Insufficient financial proof",
      "Generic motivation letter",
    ],
    notes:
      'Often called "Motivationsschreiben"; required by many German universities and sometimes for the national visa.',
  },
  {
    country_code: "FR",
    key_requirements: [
      "Alignment with Campus France / Etudes en France project (for non-EU applicants)",
      "Clear academic project and coherence with prior studies",
      "Language proficiency evidence (French or English track)",
    ],
    dos: [
      'Mirror the structure expected in the Campus France "project" fields',
      "Show coherence between past studies, chosen program, and career plan",
      "Be concise and specific",
    ],
    donts: [
      "Do not contradict the Campus France application answers",
      "Avoid generic statements about loving France",
    ],
    common_refusal_reasons: [
      "Incoherent academic project",
      "Weak language proficiency evidence",
      "Mismatch with prior academic background",
    ],
    notes:
      "Campus France procedure applies to most non-EU applicants; SOP content should mirror the online project statement.",
  },
  {
    country_code: "NL",
    key_requirements: [
      "Motivation letter tailored to the specific Dutch program",
      "Evidence of English proficiency (most programs taught in English)",
      "Clear academic/career rationale",
    ],
    dos: [
      "Reference specific courses, research groups, or faculty",
      "Explain fit with the program's often-specialized focus",
      "Keep tone professional and concise",
    ],
    donts: [
      "Do not submit a generic, non-program-specific letter",
      "Avoid overly long submissions beyond what the program requests",
    ],
    common_refusal_reasons: [
      "Weak program-specific motivation",
      "Insufficient English proficiency evidence",
      "Generic, non-tailored content",
    ],
    notes:
      "Dutch universities generally request a program-specific motivation letter rather than a broad SOP.",
  },
];

export async function up(knex: Knex): Promise<void> {
  await knex("sop_config")
    .insert(
      CONFIG.map((c) => ({
        ...c,
        compliance_rules: JSON.stringify(c.compliance_rules),
      })),
    )
    .onConflict(["country_code", "document_type"])
    .merge([
      "min_words",
      "max_words",
      "max_chars",
      "banned_phrases",
      "compliance_rules",
      "updated_at",
    ]);

  await knex("sop_country_guides")
    .insert(GUIDES)
    .onConflict("country_code")
    .merge([
      "key_requirements",
      "dos",
      "donts",
      "common_refusal_reasons",
      "notes",
      "updated_at",
    ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex("sop_country_guides")
    .whereIn("country_code", GUIDES.map((g) => g.country_code))
    .del();
  await knex("sop_config")
    .whereIn("country_code", CONFIG.map((c) => c.country_code))
    .del();
}
