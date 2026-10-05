import { createChildLogger } from "../../../shared/logger.js";
import * as knowledge from "../repositories/knowledge.repository.js";
import type { ProfileContext } from "../repositories/knowledge.repository.js";
import type { CounsellingContext } from "../repositories/sessions.repository.js";
// One card mapping and one chunk-budget rule for both retrieval paths — a divergence
// here would mean the legacy path and the tool path emitting different course-card
// shapes, or handing the model different amounts of rack context for the same question.
import { capPerDocument, courseCardFields, feeLine, rankFees } from "../lib/tools.js";
// Same cross-module import the ai-knowledge crawl worker uses — one embedding client for the platform.
import { embed, isEmbedConfigured as embeddingConfigured } from "../../superadmin/data-extraction/lib/llm-client.js";

const logger = createChildLogger("rag-service");

const STOPWORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","may","might","can","shall",
  "i","me","my","we","our","you","your","he","she","it","they","them",
  "what","which","who","whom","how","where","when","why","this","that","these","those",
  "in","on","at","to","for","of","with","by","from","about","into","through",
  "and","or","but","not","no","so","if","as",
]);

function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    // Strip punctuation — "australia?" must search as "australia"
    .map(w => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

// ── Country detection (scopes Knowledge Rack retrieval to country-specific categories) ──

const COUNTRY_ALIASES: Record<string, string> = { uk: "GB", usa: "US", america: "US", uae: "AE" };

const wordRe = (name: string) =>
  new RegExp(`\\b${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);

// ponytail: cached forever — the countries table is effectively static pre-launch
let countryMatchers: Array<{ re: RegExp; iso2: string }> | null = null;

async function detectCountryCode(query: string): Promise<string | null> {
  if (!countryMatchers) {
    const rows = await knowledge.listCountryNames().catch(err => {
      logger.warn("Country list load failed", { err: String(err) });
      return [];
    });
    if (!rows.length) return null; // don't cache a failed/empty load
    countryMatchers = [
      ...rows.map(r => ({ re: wordRe(r.name), iso2: r.iso2 })),
      ...Object.entries(COUNTRY_ALIASES).map(([alias, iso2]) => ({ re: wordRe(alias), iso2 })),
    ];
  }
  const q = query.toLowerCase();
  return countryMatchers.find(m => m.re.test(q))?.iso2 ?? null;
}

// Higher-trust sources lead the context so the model anchors on them (AC-09).
// ponytail: a course rarely has more than a handful of fees; the cap only stops a fee table
// that was scraped row-by-row from crowding the context out.
const MAX_FEE_LINES = 4;

/** Courses rendered into CONTEXT per turn: the search's own limit, plus room for the pinned ones. */
const MAX_HYDRATED = 10;

const TIER_RANK: Record<string, number> = { gov: 0, verified_institution: 1, other: 2 };
const TIER_LABEL: Record<string, string> = {
  gov: "official government source",
  verified_institution: "verified institution",
  other: "general source",
};

/**
 * Verification and expiry, stated inline so the model can qualify a figure instead of
 * asserting it. Silent when a source carries neither.
 */
function freshnessOf(row: { last_verified_at: string | null; effective_until: string | null }): string {
  const parts: string[] = [];
  if (row.last_verified_at) parts.push(`verified ${String(row.last_verified_at).slice(0, 10)}`);
  if (row.effective_until) parts.push(`stated valid until ${String(row.effective_until).slice(0, 10)}`);
  return parts.length ? `, ${parts.join(", ")}` : "";
}

/** Rack retrieval: chunk-level only — the whole-page path was retired in 20260822_001. */
async function matchRack(
  vector: number[],
  countryCode: string | null,
  trace: (step: string) => void,
  institutionId?: number | null,
): Promise<knowledge.KnowledgeChunkResult[]> {
  const capped = capPerDocument(await knowledge.matchKnowledgeChunks(vector, 8, countryCode, institutionId));
  trace(institutionId ? `This website: ${capped.length} passages found` : `Knowledge rack: ${capped.length} chunks found`);
  return capped;
}

export interface RagOutput {
  contextText: string;
  sources: Array<{ type: string; id: string; title: string }>;
  traceSteps: string[];
  /** Which money topics the CONTEXT can actually ground an answer in. The gate compares this
   *  with the topics the QUESTION asks about: a course fee row is evidence for "fees", never
   *  for "refund". Empty = nothing in context an unapproximatable money claim can rest on. */
  moneyTopics: MoneyTopic[];
}

// Fees, refunds, funding — the claims a counsellor must never approximate. Split by topic
// because a single regex over every source answered the wrong question: it asked "is there
// money anywhere in the context", when the gate needs "is there evidence for what was ASKED".
// A retrieved course fee used to clear the guard for a refund-policy question with no refund
// source anywhere (Greptile). There is no structured refund or scholarship field in any source
// here, so those two topics are groundable ONLY by prose that actually discusses them — which
// is exactly the distinction the old single boolean could not make.
const MONEY_TOPIC_RE = {
  fees: /\b(fees?|tuition|costs?|price|pricing|deposits?|instal+ments?|payments?|expenses|afford(?:able)?|expensive|cheap(?:er|est)?)\b/i,
  refund: /\b(refunds?|refundable)\b/i,
  scholarship: /\b(scholarships?|bursar(?:y|ies)|funding|grants?|waivers?|stipends?|loans?|financial aid)\b/i,
  living: /\b(cost of living|living costs?)\b/i,
} as const;

// The words above mean money wherever they appear. These don't: every one of them is the
// ordinary word for something else in this product — "finance" and "financial engineering" are
// SUBJECTS we teach, a budget is a student's constraint, "how do I pay" asks about process,
// accommodation and deferral are facilities and admin. Matching them outright is what made the
// widget answer "we don't have that specific information" to "compare two masters programs on
// fees, duration and intakes" — observed live 2026-10-05 — and to plain availability questions.
// They count only alongside a cost sense in the same message.
const MONEY_MAYBE_RE = {
  fees: /\b(pay|budget|financial|finance)\b/i,
  refund: /\b(withdraw(?:al|ing|n)?|cancel(?:lation|ling|led)?|deferr?(?:al|ing)?)\b/i,
  scholarship: /\b(funds?|discounts?)\b/i,
  living: /\b(accommodation|rent|groceries|homestay)\b/i,
} as const;

/** What turns an ambiguous word into a question about an amount. Deliberately has no "pay"
 *  family: "pay" is itself an ambiguous word above, and a word must never satisfy its own
 *  cost sense — "how do I pay" would classify itself as a money question. */
const COST_SENSE_RE =
  /\b(how much|cost(?:s|ly)?|fees?|tuition|price[sd]?|pricing|charge[sd]?|expensive|cheap(?:er|est)?|afford(?:able)?|refunds?|money|instal+ments?|deposits?|per (?:year|semester|month|week|term))\b/i;

/**
 * Where one clause of a question stops and the next begins. The cost sense that promotes an
 * ambiguous word has to come from the SAME clause, or a money clause lends its cost sense to an
 * unrelated one: "what are the fees, and can I defer my start date?" read "defer" as a refund
 * question, and the withhold line for `refund` names deferrals — so the start-date answer we
 * hold was gagged by the fee clause beside it (Greptile).
 *
 * ponytail: conjunctions and sentence enders only. A bare comma splice ("what are the fees, can
 * I defer?") still reads as one clause; splitting on every comma separates appositives from
 * their own cost sense ("how much, roughly, is accommodation?") and loses more than it saves.
 * Split on commas too if real transcripts show the splice is common.
 */
const CLAUSE_SPLIT_RE = /[.!?;\n]+|,?\s+(?:and|but|also|plus|or)\s+/gi;

export type MoneyTopic = keyof typeof MONEY_TOPIC_RE;
const MONEY_TOPICS = Object.keys(MONEY_TOPIC_RE) as MoneyTopic[];

/**
 * Every money topic a piece of text touches, read GENEROUSLY — the ambiguous words count too.
 *
 * This is the CONTEXT side: it answers "could this passage ground a money answer?", and the
 * safe error there is to say yes. A passage that quotes a monthly rent in prose must ground a
 * cost-of-living question even though "rent" on its own is ambiguous; tightening this side
 * would withhold MORE answers, which is the opposite of the defect.
 */
export function moneyTopicsOf(text: string): MoneyTopic[] {
  return MONEY_TOPICS.filter((topic) => MONEY_TOPIC_RE[topic].test(text) || MONEY_MAYBE_RE[topic].test(text));
}

/**
 * Every money topic a QUESTION actually asks about, read strictly.
 *
 * This is the asked side: it answers "is the visitor asking for an amount?", and here the safe
 * error is to say no — a false yes gags an answer we hold, which costs the visitor their reply.
 * A false no only means the model answers from context as usual, still bound by the
 * "money comes only from CONTEXT" rule in the system prompt.
 *
 * Read per clause: an unambiguous money word counts wherever it appears, but an ambiguous one is
 * promoted only by a cost sense standing next to it in the same clause.
 */
export function askedMoneyTopics(query: string): MoneyTopic[] {
  const clauses = query.split(CLAUSE_SPLIT_RE).filter((c) => c?.trim());
  return MONEY_TOPICS.filter((topic) => clauses.some((clause) =>
    MONEY_TOPIC_RE[topic].test(clause) || (COST_SENSE_RE.test(clause) && MONEY_MAYBE_RE[topic].test(clause))));
}

export const isMoneyQuestion = (query: string): boolean => askedMoneyTopics(query).length > 0;

/** The courses the counsellor last put in front of the student (oldest-first history), so a
 *  follow-up like "this course" resolves. Shared by the signed-in and widget-visitor paths. */
export function pinnedCourseIdsFrom(messages: Array<{ role: string; cards: unknown[] }>): string[] {
  const lastCards = [...messages].reverse().find((m) => m.role === "assistant" && m.cards?.length)?.cards ?? [];
  return lastCards
    .map((c) => (c as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string")
    .slice(0, 3);
}

/** The gate: a money question with no context evidence on ANY topic it asks about.
 *  Overlap, not equality — "what are the fees and is there a scholarship" is answerable
 *  the moment either one is grounded, and the model still only says what its context holds. */
export function shouldWithholdMoney(query: string, contextTopics: MoneyTopic[]): boolean {
  const asked = askedMoneyTopics(query);
  return asked.length > 0 && !asked.some((topic) => contextTopics.includes(topic));
}

export async function searchAll(opts: {
  query: string;
  userId: number;
  /** Embed mode: restrict courses to these extraction_jobs ids and skip
   * institution/agent sources (competitor data must not surface under a
   * business's brand). Visas stay unscoped — shared platform knowledge. */
  jobIds?: string[];
  /** Discovery turn: skip course retrieval so the model counsels instead of
   * recommending — it cannot list courses it never saw. */
  skipCourses?: boolean;
  /** Embed mode: read THIS institution's own crawled website instead of the global rack.
   *  Unset for a business widget, which keeps the rack switched off entirely. */
  rackInstitutionId?: number | null;
  /** Courses the counsellor already showed this conversation (the last reply's cards). A follow-up
   *  — "is online study an option for this course?" — keyword-matches nothing useful, and without
   *  the course in CONTEXT the model disowned what it had said one message earlier. */
  pinnedCourseIds?: string[];
  onTrace?: (step: string) => void;
}): Promise<RagOutput> {
  const embedScoped = opts.jobIds != null;
  const keywords = extractKeywords(opts.query);
  const searchQuery = keywords.join(" ");
  const pinned = opts.pinnedCourseIds ?? [];
  const trace = (step: string) => {
    traceSteps.push(step);
    opts.onTrace?.(step);
  };
  const traceSteps: string[] = [];

  if (!searchQuery && !pinned.length) {
    trace("No searchable keywords extracted");
    return { contextText: "", sources: [], traceSteps, moneyTopics: [] };
  }

  if (searchQuery) trace(`Keywords: ${keywords.join(", ")}`);
  else trace("No searchable keywords; answering from the courses already shown");

  const countryCode = await detectCountryCode(opts.query);
  if (countryCode) trace(`Country detected: ${countryCode}`);

  // ── Parallel searches — each wrapped so one failure doesn't kill the rest ──
  const none = Promise.resolve([]);
  const noOwner = { overview: [], campuses: [], accreditations: [] };
  const [courses, visas, institutions, ownerProfile, agents, maraAgents, knowledgeVisas, faqs, guides, rackHits] = !searchQuery
    ? [[], [], [], noOwner, [], [], [], [], [], []] as Awaited<ReturnType<typeof runSearches>>
    : await runSearches();
  async function runSearches() { return Promise.all([
    opts.skipCourses ? none.then(r => { trace("Courses: skipped (discovery turn)"); return r; })
      : knowledge.searchCourses({ query: searchQuery, limit: 8, jobIds: opts.jobIds })
        .then(r => { trace(`Courses: ${r.length} found`); return r; })
        .catch(err => { logger.warn("Course search failed", { err: String(err) }); trace("Course search failed"); return []; }),
    knowledge.searchVisas({ query: searchQuery, limit: 5 })
      .then(r => { trace(`Visas: ${r.length} found`); return r; })
      .catch(err => { logger.warn("Visa search failed", { err: String(err) }); trace("Visa search failed"); return []; }),
    embedScoped ? none : knowledge.searchInstitutions({ query: searchQuery, limit: 5 })
      .then(r => { trace(`Institutions: ${r.length} found`); return r; })
      .catch(err => { logger.warn("Institution search failed", { err: String(err) }); trace("Institution search failed"); return []; }),

    // The widget owner's OWN profile. Embed mode suppresses the institution search above so
    // a competitor never surfaces under this brand — but that also hid the one institution
    // the widget is FOR. Scoped strictly to the owner's own jobIds, so the anti-leak
    // guarantee is unchanged: an empty scope still yields nothing.
    embedScoped
      ? knowledge.ownerProfileByJobs(opts.jobIds ?? [])
        .then(r => { trace(`Own profile: ${r.overview.length ? "found" : "none"}, ${r.campuses.length} campuses`); return r; })
        .catch(err => {
          logger.warn("Owner profile lookup failed", { err: String(err) });
          return { overview: [], campuses: [], accreditations: [] };
        })
      : Promise.resolve({ overview: [], campuses: [], accreditations: [] }),
    embedScoped ? none : knowledge.searchAgents({ query: searchQuery, limit: 5 })
      .then(r => { trace(`Agents: ${r.length} found`); return r; })
      .catch(err => { logger.warn("Agent search failed", { err: String(err) }); trace("Agent search failed"); return []; }),
    embedScoped ? none : knowledge.searchMaraAgents({ query: searchQuery, limit: 5 })
      .then(r => { trace(`MARA agents: ${r.length} found`); return r; })
      .catch(err => { logger.warn("MARA search failed", { err: String(err) }); trace("MARA search failed"); return []; }),
    // ── Phase 4: curated knowledge + Knowledge Rack ──
    knowledge.searchKnowledgeVisas({ query: searchQuery, limit: 3 })
      .then(r => { trace(`Visa knowledge: ${r.length} found`); return r; })
      .catch(err => { logger.warn("Visa knowledge search failed", { err: String(err) }); return []; }),
    knowledge.searchKnowledgeFaqs({ query: searchQuery, limit: 5 })
      .then(r => { trace(`FAQs: ${r.length} found`); return r; })
      .catch(err => { logger.warn("FAQ search failed", { err: String(err) }); return []; }),
    knowledge.searchCountryGuides({ query: searchQuery, limit: 2 })
      .then(r => { trace(`Country guides: ${r.length} found`); return r; })
      .catch(err => { logger.warn("Country guide search failed", { err: String(err) }); return []; }),
    // Rack retrieval is semantic (vector) search on the raw query.
    //
    // In embed mode it reads the WIDGET OWNER'S OWN crawled website and nothing else, so a
    // visitor can ask about anything published on the site the widget is installed on —
    // policies, scholarships, eligibility prose — that structured extraction never captured.
    // Global rack content stays out of embed answers, and the owner's site stays out of
    // global ones; the SQL function enforces both directions.
    !embeddingConfigured() || (embedScoped && !opts.rackInstitutionId) ? none : embed(opts.query)
      .then(v => matchRack(v, countryCode, trace, opts.rackInstitutionId))
      .catch(err => { logger.warn("Knowledge rack search failed", { err: String(err) }); trace("Knowledge rack search failed"); return []; }),
  ]); }

  // ── Hydrate course details for found courses ──
  // Pinned first: the course under discussion must survive the cap whatever else matched.
  let hydratedCourses: knowledge.CourseDetailResult[] = [];
  const courseIds = [...new Set([...pinned, ...courses.map(c => c.id)])].slice(0, MAX_HYDRATED);
  if (courseIds.length > 0) {
    trace(`Hydrating ${courseIds.length} courses`);
    const details = await Promise.all(
      courseIds.map(id =>
        knowledge.getCourseDetails(id, { jobIds: opts.jobIds }).catch(err => {
          logger.warn("Course detail fetch failed", { id, err: String(err) });
          return undefined;
        }),
      ),
    );
    hydratedCourses = details.filter((d): d is knowledge.CourseDetailResult => d != null);
    trace(`Hydrated: ${hydratedCourses.length} courses`);
  }

  // ── Build context text ──
  const parts: string[] = [];
  const sources: RagOutput["sources"] = [];

  // First in the context on purpose: everything after it is offered BY this institution,
  // and the model needs to know who "we" is before it reads the catalogue.
  if (ownerProfile.overview.length) {
    const [own] = ownerProfile.overview;
    const lines = [
      "--- THIS INSTITUTION (you represent it; answer questions about it from here) ---",
      `Name: ${own.name ?? "Unknown"}`,
      own.description ? `About: ${own.description.slice(0, 1200)}` : "",
      [own.address, own.city, own.state, own.country].filter(Boolean).length
        ? `Location: ${[own.address, own.city, own.state, own.country].filter(Boolean).join(", ")}`
        : "",
      // Its own published contact details, from its own website — safe to quote, unlike a
      // person's. The privacy rule in the system prompt is narrowed to match.
      own.phone ? `Phone: ${own.phone}` : "",
      own.email ? `Email: ${own.email}` : "",
      own.website ? `Website: ${own.website}` : "",
    ];

    if (ownerProfile.campuses.length) {
      lines.push(`Campuses (${ownerProfile.campuses.length}):`);
      for (const c of ownerProfile.campuses) {
        const where = [c.address, c.city, c.state, c.country].filter(Boolean).join(", ");
        lines.push(`  - ${c.name ?? "Campus"}${where ? `: ${where}` : ""}${c.phone ? ` (${c.phone})` : ""}`);
      }
    }
    if (ownerProfile.accreditations.length) {
      lines.push(
        `Accreditations: ${ownerProfile.accreditations
          .map(a => (a.issuing_organization ? `${a.name} (${a.issuing_organization})` : a.name))
          .join("; ")}`,
      );
    }
    lines.push("");

    parts.push(lines.filter(Boolean).join("\n"));
    sources.push({ type: "institution", id: own.id, title: own.name ?? "This institution" });
  }

  if (hydratedCourses.length) {
    const lines = ["--- COURSES ---"];
    for (const c of hydratedCourses) {
      const intakeNames = c.intakes.map(i => i.intake_name).filter(Boolean);
      const modes = c.study_options.map(o => o.study_mode).filter(Boolean);
      lines.push(
        `Course: ${c.name} at ${c.institution_name ?? "Unknown"}`,
        `  Level: ${c.degree_level ?? "N/A"}`,
        `  Duration: ${c.duration_weeks ?? "N/A"} weeks`,
        // Every fee, each with its own period, currency and the page's wording — one summed
        // number can't answer "is that per year?", which is most of what students ask about cost.
        // Ranked before the cap so the rows that survive it are the same ones the card headlines.
        c.fees.length
          ? rankFees(c.fees).slice(0, MAX_FEE_LINES).map(f => `  Fees: ${feeLine(f)}`).join("\n")
          : "  Fees: N/A",
        `  Country: ${c.institution_country ?? c.country_code ?? "N/A"}`,
        intakeNames.length ? `  Intakes: ${intakeNames.join(", ")}` : "",
        modes.length ? `  Study Modes: ${modes.join(", ")}` : "",
        c.english_requirements.length
          ? `  English: ${c.english_requirements.map(r => `${r.test_type_name ?? "Test"} ${r.overall_score ?? ""}`).join("; ")}`
          : "",
        c.eligibility.length
          ? `  Eligibility: ${c.eligibility.map(e => e.description ?? e.name).join("; ")}`
          : "",
        `  CARD_FIELDS: ${JSON.stringify(courseCardFields(c))}`,
        "",
      );
      sources.push({ type: "course", id: c.id, title: c.name });
    }
    parts.push(lines.filter(Boolean).join("\n"));
  }

  if (visas.length) {
    const lines = ["--- VISA INFORMATION ---"];
    for (const v of visas) {
      lines.push(
        `Visa: ${v.name ?? v.subclass_code ?? "Unknown"}`,
        `  Country: ${v.country_code ?? "N/A"}`,
        v.visa_stream ? `  Stream: ${v.visa_stream}` : "",
        v.category ? `  Category: ${v.category}` : "",
        v.description ? `  Description: ${v.description}` : "",
        v.duration_months != null ? `  Duration: ${v.duration_months} months` : "",
        v.application_fee_amount != null ? `  Fee: ${v.application_fee_currency ?? ""} ${v.application_fee_amount}` : "",
        v.processing_time_min_days != null ? `  Processing: ${v.processing_time_min_days}–${v.processing_time_max_days ?? "?"} days` : "",
        v.official_url ? `  URL: ${v.official_url}` : "",
        "",
      );
      sources.push({ type: "visa", id: v.id, title: v.name ?? v.subclass_code ?? "Visa" });
    }
    parts.push(lines.filter(Boolean).join("\n"));
  }

  if (institutions.length) {
    const lines = ["--- INSTITUTIONS ---"];
    for (const inst of institutions) {
      lines.push(
        `Institution: ${inst.name ?? "Unknown"}`,
        inst.country ? `  Country: ${inst.country}` : "",
        inst.city ? `  City: ${inst.city}` : "",
        inst.website ? `  Website: ${inst.website}` : "",
        inst.description ? `  Description: ${inst.description.slice(0, 300)}` : "",
        "",
      );
      sources.push({ type: "institution", id: inst.id, title: inst.name ?? "Institution" });
    }
    parts.push(lines.filter(Boolean).join("\n"));
  }

  if (agents.length) {
    const lines = ["--- EDUCATION AGENTS ---"];
    for (const a of agents) {
      lines.push(
        `Agent: ${a.name ?? "Unknown"}`,
        a.country ? `  Country: ${a.country}` : "",
        a.city ? `  City: ${a.city}` : "",
        a.website ? `  Website: ${a.website}` : "",
        "",
      );
      sources.push({ type: "agent", id: a.id, title: a.name ?? "Agent" });
    }
    parts.push(lines.filter(Boolean).join("\n"));
  }

  if (maraAgents.length) {
    const lines = ["--- MARA AGENTS ---"];
    for (const m of maraAgents) {
      lines.push(
        `MARA Agent: ${m.agent_name ?? m.business_name ?? "Unknown"} (MARN: ${m.marn})`,
        m.office_country ? `  Country: ${m.office_country}` : "",
        m.registration_status ? `  Status: ${m.registration_status}` : "",
        m.practice_areas?.length ? `  Practice Areas: ${m.practice_areas.join(", ")}` : "",
        "",
      );
      sources.push({ type: "mara_agent", id: m.id, title: m.agent_name ?? m.business_name ?? "MARA Agent" });
    }
    parts.push(lines.filter(Boolean).join("\n"));
  }

  if (knowledgeVisas.length) {
    const lines = ["--- VISA KNOWLEDGE (admin-verified) ---"];
    for (const v of knowledgeVisas) {
      lines.push(
        `${v.destination_country} — ${v.visa_type}`,
        Object.keys(v.requirements ?? {}).length ? `  Requirements: ${JSON.stringify(v.requirements)}` : "",
        v.required_documents?.length ? `  Documents: ${v.required_documents.join(", ")}` : "",
        v.processing_time_days != null ? `  Processing: ~${v.processing_time_days} days` : "",
        v.application_fee_usd != null ? `  Fee: USD ${v.application_fee_usd}` : "",
        v.work_rights_hours != null ? `  Work rights: ${v.work_rights_hours} hrs/fortnight` : "",
        v.post_study_visa ? `  Post-study visa: ${v.post_study_visa}` : "",
        v.common_rejections?.length ? `  Common rejections: ${v.common_rejections.join("; ")}` : "",
        "",
      );
      sources.push({ type: "knowledge_visa", id: v.id, title: `${v.destination_country} ${v.visa_type}` });
    }
    parts.push(lines.filter(Boolean).join("\n"));
  }

  if (faqs.length) {
    const lines = ["--- FAQs ---"];
    for (const f of faqs) {
      lines.push(`Q: ${f.question}`, `A: ${f.answer}`, "");
      sources.push({ type: "faq", id: f.id, title: f.question });
    }
    parts.push(lines.join("\n"));
  }

  if (guides.length) {
    const lines = ["--- COUNTRY GUIDES ---"];
    for (const g of guides) {
      lines.push(
        `Country: ${g.country}`,
        g.education_system ? `  Education system: ${g.education_system}` : "",
        g.popular_cities?.length ? `  Popular cities: ${g.popular_cities.join(", ")}` : "",
        g.cost_of_living_monthly_usd ? `  Cost of living (USD/month): ${JSON.stringify(g.cost_of_living_monthly_usd)}` : "",
        g.culture_notes ? `  Culture: ${g.culture_notes}` : "",
        g.student_life ? `  Student life: ${g.student_life}` : "",
        g.climate ? `  Climate: ${g.climate}` : "",
        "",
      );
      sources.push({ type: "country_guide", id: g.id, title: `${g.country} guide` });
    }
    parts.push(lines.filter(Boolean).join("\n"));
  }

  if (rackHits.length) {
    const rendered = renderRackHits(rackHits);
    parts.push(rendered.text);
    sources.push(...rendered.sources);
  }

  const contextText = parts.join("\n\n");
  const moneyTopics = new Set<MoneyTopic>();
  // Structured fields name their own topic — unambiguous, so no regex over the rendered text
  // (CARD_FIELDS JSON carries a "fees" key for every course, which would make the text look
  // money-bearing when it is not). Every rendered money field must appear here, or the model is
  // told to withhold what its own context contains: knowledgeVisas renders "Fee: USD x" above.
  if (hydratedCourses.some(c => c.fees.length > 0)) moneyTopics.add("fees");
  if (visas.some(v => v.application_fee_amount != null)
    || knowledgeVisas.some(v => v.application_fee_usd != null)) moneyTopics.add("fees");
  if (guides.some(g => !!g.cost_of_living_monthly_usd)) moneyTopics.add("living");
  // Prose grounds whichever topics it actually discusses — this is the only way refund and
  // scholarship questions ever become answerable, since no source here has a field for them.
  for (const f of faqs) for (const topic of moneyTopicsOf(`${f.question} ${f.answer}`)) moneyTopics.add(topic);
  for (const d of rackHits) for (const topic of moneyTopicsOf(d.content)) moneyTopics.add(topic);

  const topics = [...moneyTopics];
  trace(`Context: ${contextText.length} chars, ${sources.length} sources${topics.length ? `, money evidence: ${topics.join(", ")}` : ""}`);
  return { contextText, sources, traceSteps, moneyTopics: topics };
}

/** Rack chunks as prompt text + deduped sources — one format for every retrieval path. */
function renderRackHits(rackHits: knowledge.KnowledgeChunkResult[]): {
  text: string;
  sources: RagOutput["sources"];
} {
  // Trust-tier first, similarity second — official sources lead the context.
  rackHits.sort((a, b) =>
    (TIER_RANK[a.trust_tier] ?? 2) - (TIER_RANK[b.trust_tier] ?? 2) || b.similarity - a.similarity,
  );
  const lines = ["--- KNOWLEDGE ARTICLES (retrieved passages, most authoritative first) ---"];
  const sources: RagOutput["sources"] = [];
  // Two chunks of one document are one source to the student.
  const cited = new Set<string>();
  for (const d of rackHits) {
    const tier = TIER_LABEL[d.trust_tier] ?? "general source";
    const origin = d.source_type === "file" ? (d.file_name ?? "uploaded document") : d.source_domain;
    const where = [d.title, d.heading_path].filter(Boolean).join(" › ");
    const page = d.page_number ? ` (page ${d.page_number})` : "";
    // The whole chunk goes in: it is section-sized by construction, which is the
    // point of chunking — no truncation, so the answer can't be cut off.
    lines.push(
      `Passage: ${where || origin} (${origin}, ${d.category_label}, ${tier}${freshnessOf(d)})`,
      ...d.content.split("\n").map((line) => `  ${line}`),
      `  Source: ${d.url ?? d.file_name ?? origin}${page}`,
      "",
    );
    if (!cited.has(d.document_id)) {
      cited.add(d.document_id);
      sources.push({ type: "document", id: d.document_id, title: where || origin });
    }
  }
  return { text: lines.join("\n"), sources };
}

/** The student's situation as one line of search text, or null when nothing is known.
 * Exported for the self-check script only. */
export function situationText(
  profile: ProfileContext | null,
  ctx: CounsellingContext | null | undefined,
): string | null {
  const p = profile?.profile;
  const parts = [
    p?.nationality && `nationality ${p.nationality}`,
    p?.country_of_residence && `living in ${p.country_of_residence}`,
    p?.degree_level && `highest degree ${p.degree_level}`,
    p?.preferred_destinations && `preferred destinations ${JSON.stringify(p.preferred_destinations)}`,
    (p?.budget_min != null || p?.budget_max != null) &&
      `budget ${p?.budget_currency ?? ""} ${p?.budget_min ?? "?"}-${p?.budget_max ?? "?"}`,
    ctx?.goals?.length && `goals: ${ctx.goals.join(", ")}`,
    ctx?.interests?.length && `interests: ${ctx.interests.join(", ")}`,
    ctx?.constraints?.length && `constraints: ${ctx.constraints.join(", ")}`,
    ctx?.stage && `journey stage: ${ctx.stage}`,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);
  return parts.length ? parts.join("; ") : null;
}

/**
 * Proactive Knowledge Rack pass for tool-mode turns.
 *
 * The tool loop only reaches the rack when the model decides to search, and it searches
 * in the student's literal words — so guidance that applies to the student's SITUATION
 * (a visa rule for their destination, an admission consideration for their background,
 * a counselling guideline for their stage) never surfaced unless asked about directly.
 * This runs one vector search per turn seeded with message + profile + session context
 * and hands the result to the prompt as a briefing, not an answer.
 */
export async function counsellorBriefing(opts: {
  message: string;
  profile: ProfileContext | null;
  counsellingContext?: CounsellingContext | null;
  onTrace?: (step: string) => void;
}): Promise<{ text: string; sources: RagOutput["sources"] }> {
  const empty = { text: "", sources: [] };
  if (!embeddingConfigured()) return empty;
  try {
    const situation = situationText(opts.profile, opts.counsellingContext);
    const query = situation ? `${opts.message}\nStudent situation: ${situation}` : opts.message;
    const countryCode = await detectCountryCode(query);
    const vector = await embed(query);
    const hits = capPerDocument(await knowledge.matchKnowledgeChunks(vector, 6, countryCode));
    opts.onTrace?.(`Knowledge rack briefing: ${hits.length} passages`);
    if (!hits.length) return empty;
    return renderRackHits(hits);
  } catch (err) {
    logger.warn("Counsellor briefing failed", { err: String(err) });
    return empty; // ponytail: briefing is additive — a failure costs guidance, never the turn
  }
}
