import { createChildLogger } from "../../../shared/logger.js";
import { courseSlug } from "../../search/utils/slug.js";
import * as knowledge from "../repositories/knowledge.repository.js";
// Same cross-module import the ai-knowledge crawl worker uses — one embedding client for the platform.
import { embed, isConfigured as embeddingConfigured } from "../../superadmin/data-extraction/lib/llm-client.js";

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
const TIER_RANK: Record<string, number> = { gov: 0, verified_institution: 1, other: 2 };
const TIER_LABEL: Record<string, string> = {
  gov: "official government source",
  verified_institution: "verified institution",
  other: "general source",
};

export interface RagOutput {
  contextText: string;
  sources: Array<{ type: string; id: string; title: string }>;
  traceSteps: string[];
}

export async function searchAll(opts: {
  query: string;
  userId: number;
  /** Embed mode: restrict courses to these extraction_jobs ids and skip
   * institution/agent sources (competitor data must not surface under a
   * business's brand). Visas stay unscoped — shared platform knowledge. */
  jobIds?: string[];
  onTrace?: (step: string) => void;
}): Promise<RagOutput> {
  const embedScoped = opts.jobIds != null;
  const keywords = extractKeywords(opts.query);
  const searchQuery = keywords.join(" ");
  const trace = (step: string) => {
    traceSteps.push(step);
    opts.onTrace?.(step);
  };
  const traceSteps: string[] = [];

  if (!searchQuery) {
    trace("No searchable keywords extracted");
    return { contextText: "", sources: [], traceSteps };
  }

  trace(`Keywords: ${keywords.join(", ")}`);

  const countryCode = await detectCountryCode(opts.query);
  if (countryCode) trace(`Country detected: ${countryCode}`);

  // ── Parallel searches — each wrapped so one failure doesn't kill the rest ──
  const none = Promise.resolve([]);
  const [courses, visas, institutions, agents, maraAgents, knowledgeVisas, faqs, guides, documents] = await Promise.all([
    knowledge.searchCourses({ query: searchQuery, limit: 8, jobIds: opts.jobIds })
      .then(r => { trace(`Courses: ${r.length} found`); return r; })
      .catch(err => { logger.warn("Course search failed", { err: String(err) }); trace("Course search failed"); return []; }),
    knowledge.searchVisas({ query: searchQuery, limit: 5 })
      .then(r => { trace(`Visas: ${r.length} found`); return r; })
      .catch(err => { logger.warn("Visa search failed", { err: String(err) }); trace("Visa search failed"); return []; }),
    embedScoped ? none : knowledge.searchInstitutions({ query: searchQuery, limit: 5 })
      .then(r => { trace(`Institutions: ${r.length} found`); return r; })
      .catch(err => { logger.warn("Institution search failed", { err: String(err) }); trace("Institution search failed"); return []; }),
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
    // Rack documents are semantic (vector) search on the raw query. Skipped in embed
    // mode — crawled institution updates must not surface under another business's brand.
    embedScoped || !embeddingConfigured() ? none : embed(opts.query)
      .then(v => knowledge.matchKnowledgeDocuments(v, 6, countryCode))
      .then(r => { trace(`Knowledge rack: ${r.length} found`); return r; })
      .catch(err => { logger.warn("Knowledge rack search failed", { err: String(err) }); trace("Knowledge rack search failed"); return []; }),
  ]);

  // ── Hydrate course details for found courses ──
  let hydratedCourses: knowledge.CourseDetailResult[] = [];
  if (courses.length > 0) {
    const courseIds = courses.map(c => c.id);
    trace(`Hydrating ${courseIds.length} courses`);
    const details = await Promise.all(
      courseIds.map(id =>
        knowledge.getCourseDetails(id).catch(err => {
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

  if (hydratedCourses.length) {
    const lines = ["--- COURSES ---"];
    for (const c of hydratedCourses) {
      const fee = c.fees.find(f => f.student_type === "international") ?? c.fees[0];
      const intakeNames = c.intakes.map(i => i.intake_name).filter(Boolean);
      const modes = c.study_options.map(o => o.study_mode).filter(Boolean);
      lines.push(
        `Course: ${c.name} at ${c.institution_name ?? "Unknown"}`,
        `  Level: ${c.degree_level ?? "N/A"}`,
        `  Duration: ${c.duration_weeks ?? "N/A"} weeks`,
        fee ? `  Fees: ${fee.currency} ${fee.total_amount} (${fee.student_type})` : "  Fees: N/A",
        `  Country: ${c.institution_country ?? c.country_code ?? "N/A"}`,
        intakeNames.length ? `  Intakes: ${intakeNames.join(", ")}` : "",
        modes.length ? `  Study Modes: ${modes.join(", ")}` : "",
        c.english_requirements.length
          ? `  English: ${c.english_requirements.map(r => `${r.test_type_name ?? "Test"} ${r.overall_score ?? ""}`).join("; ")}`
          : "",
        c.eligibility.length
          ? `  Eligibility: ${c.eligibility.map(e => e.description ?? e.name).join("; ")}`
          : "",
        `  CARD_FIELDS: ${JSON.stringify({
          id: c.id, slug: courseSlug(c.name, c.id), name: c.name, institution: c.institution_name,
          degree_level: c.degree_level, duration: c.duration_weeks ? `${c.duration_weeks} weeks` : null,
          fees: fee?.total_amount ?? null, currency: fee?.currency ?? null,
          country: c.institution_country ?? c.country_code, city: c.campuses[0]?.campus_name ?? null,
          intakes: intakeNames, study_modes: modes, source_url: c.source_url,
        })}`,
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

  if (documents.length) {
    // Trust-tier first, similarity second — official sources lead the context.
    documents.sort((a, b) =>
      (TIER_RANK[a.trust_tier] ?? 2) - (TIER_RANK[b.trust_tier] ?? 2) || b.similarity - a.similarity,
    );
    const lines = ["--- KNOWLEDGE ARTICLES (crawled sources, most authoritative first) ---"];
    for (const d of documents) {
      lines.push(
        `Article: ${d.title ?? d.url} (${d.source_domain}, ${d.category_label}, ${TIER_LABEL[d.trust_tier] ?? "general source"})`,
        // Full pages run to thousands of words; cap each so four articles can't crowd out course data.
        `  ${d.markdown.slice(0, 1500)}`,
        `  Source: ${d.url}`,
        "",
      );
      sources.push({ type: "document", id: d.id, title: d.title ?? d.url });
    }
    parts.push(lines.join("\n"));
  }

  const contextText = parts.join("\n\n");
  trace(`Context: ${contextText.length} chars, ${sources.length} sources`);
  return { contextText, sources, traceSteps };
}
