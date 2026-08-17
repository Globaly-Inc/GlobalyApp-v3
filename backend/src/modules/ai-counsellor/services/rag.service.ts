import { createChildLogger } from "../../../shared/logger.js";
import * as knowledge from "../repositories/knowledge.repository.js";

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
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

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

  // ── Parallel searches — each wrapped so one failure doesn't kill the rest ──
  const none = Promise.resolve([]);
  const [courses, visas, institutions, agents, maraAgents] = await Promise.all([
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
          id: c.id, name: c.name, institution: c.institution_name,
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

  const contextText = parts.join("\n\n");
  trace(`Context: ${contextText.length} chars, ${sources.length} sources`);
  return { contextText, sources, traceSteps };
}
