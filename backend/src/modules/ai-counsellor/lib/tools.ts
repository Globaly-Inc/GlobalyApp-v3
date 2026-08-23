// Gemini function declarations for the counsellor, plus the dispatcher that runs them.
//
// Phase 7. Before this, rag.service fired all nine searches on every turn and pasted
// the lot into the prompt. Now the model asks for what it needs — and, more usefully,
// can decide NOT to search and ask the student a question instead. That decision *is*
// the intent detection and stage management the PRD asks for; no classifier needed.
//
// Every implementation here is an existing knowledge.repository call. This is
// re-plumbing, not new retrieval.

import { SchemaType, type FunctionDeclaration, type Tool } from "@google/generative-ai";
import { createChildLogger } from "../../../shared/logger.js";
import { courseSlug } from "../../search/utils/slug.js";
import { embed, isConfigured as embeddingConfigured } from "../../superadmin/data-extraction/lib/llm-client.js";
import * as knowledge from "../repositories/knowledge.repository.js";
import * as sessionsRepo from "../repositories/sessions.repository.js";
import type { CounsellingContext } from "../repositories/sessions.repository.js";

const logger = createChildLogger("ai-tools");

export interface ToolSource {
  type: string;
  id: string;
  title: string;
}

/** What a tool needs to know about the turn it is running in. */
export interface ToolContext {
  sessionId: number;
}

export interface ToolRun {
  /** JSON handed back to the model as the functionResponse payload. */
  result: unknown;
  /** Sources to surface to the client and persist on the message. */
  sources: ToolSource[];
  /** One line for the trace/thinking stream. */
  trace: string;
}

/** Hydrating a course is 8 queries — keep the fan-out small. */
const MAX_COURSES = 6;

// ── Card fields ──

/**
 * The exact object the model copies into a ```course-card``` block. Shared with
 * rag.service's CARD_FIELDS line so the two retrieval paths can never drift into
 * emitting different card shapes.
 */
export function courseCardFields(c: knowledge.CourseDetailResult) {
  const fee = c.fees.find((f) => f.student_type === "international") ?? c.fees[0];
  return {
    id: c.id,
    slug: courseSlug(c.name, c.id),
    name: c.name,
    institution: c.institution_name,
    degree_level: c.degree_level,
    duration: c.duration_weeks ? `${c.duration_weeks} weeks` : null,
    fees: fee?.total_amount ?? null,
    currency: fee?.currency ?? null,
    country: c.institution_country ?? c.country_code,
    city: c.campuses[0]?.campus_name ?? null,
    intakes: c.intakes.map((i) => i.intake_name).filter(Boolean),
    study_modes: c.study_options.map((o) => o.study_mode).filter(Boolean),
    source_url: c.source_url,
  };
}

/** A course as the model sees it: readable facts plus the verbatim card object. */
function courseForModel(c: knowledge.CourseDetailResult) {
  return {
    name: c.name,
    institution: c.institution_name,
    degree_level: c.degree_level,
    subject_area: c.subject_area,
    duration_weeks: c.duration_weeks,
    country: c.institution_country ?? c.country_code,
    fees: c.fees.map((f) => ({ student_type: f.student_type, currency: f.currency, total: f.total_amount })),
    intakes: c.intakes.map((i) => i.intake_name).filter(Boolean),
    study_modes: c.study_options.map((o) => o.study_mode).filter(Boolean),
    english_requirements: c.english_requirements.map((r) => ({
      test: r.test_type_name, overall: r.overall_score,
    })),
    eligibility: c.eligibility.map((e) => e.description ?? e.name).filter(Boolean),
    career_paths: c.career_paths,
    card: courseCardFields(c),
  };
}

async function hydrate(ids: string[]): Promise<knowledge.CourseDetailResult[]> {
  const details = await Promise.all(
    ids.slice(0, MAX_COURSES).map((id) =>
      knowledge.getCourseDetails(id).catch((err) => {
        logger.warn("Course detail fetch failed", { id, err: String(err) });
        return undefined;
      }),
    ),
  );
  return details.filter((d): d is knowledge.CourseDetailResult => d != null);
}

// ── Declarations ──

const DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "search_courses",
    description:
      "Search verified courses in the Globaly database. Use only once you understand what the student " +
      "wants to study and at least one constraint (destination, budget, level). Returns fees, intakes, " +
      "entry requirements and a `card` object per course.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: "Subject and keywords, e.g. 'data science masters'" },
        country: { type: SchemaType.STRING, description: "Destination country name, e.g. 'Canada'" },
        degree_level: { type: SchemaType.STRING, description: "e.g. 'Bachelor', 'Master', 'Diploma'" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_course_details",
    description:
      "Full detail for one course by id — units, campuses, accreditations, every fee and requirement. " +
      "Use when the student asks about a specific course already surfaced by search_courses.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { course_id: { type: SchemaType.STRING, description: "Course id from a previous result" } },
      required: ["course_id"],
    },
  },
  {
    name: "search_knowledge",
    description:
      "Search the curated knowledge base: visa rules, country education systems, FAQs, and passages from " +
      "crawled official sources. Use for any question about visas, education systems, costs of living, " +
      "post-study work, or 'how does X work in country Y'.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: "The student's question, in their words" },
        country_code: { type: SchemaType.STRING, description: "Two-letter ISO code to scope results, e.g. 'AU'" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_visas",
    description:
      "Search structured visa records (subclass, stream, fees, processing times, work rights). Use for " +
      "specific visa products; use search_knowledge for how visa rules work in practice.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { query: { type: SchemaType.STRING, description: "Visa name, subclass or keywords" } },
      required: ["query"],
    },
  },
  {
    name: "search_institutions",
    description: "Search institutions in the database by name, city or country.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { query: { type: SchemaType.STRING, description: "Institution name or location" } },
      required: ["query"],
    },
  },
  {
    name: "update_student_context",
    description:
      "Record what you have learned about this student in this conversation — goals, interests, " +
      "strengths, constraints, preferred countries, and which stage of the journey they are in. " +
      "Call this whenever the student tells you something durable about themselves, so you do not " +
      "have to ask again later in the conversation. Send only the fields that changed.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        goals: {
          type: SchemaType.ARRAY, items: { type: SchemaType.STRING },
          description: "What they want out of studying — career or study outcomes, in their words",
        },
        interests: {
          type: SchemaType.ARRAY, items: { type: SchemaType.STRING },
          description: "Subjects and fields they are drawn to",
        },
        strengths: {
          type: SchemaType.ARRAY, items: { type: SchemaType.STRING },
          description: "What they are good at, as they described it",
        },
        constraints: {
          type: SchemaType.ARRAY, items: { type: SchemaType.STRING },
          description: "Budget, family, timing, location or other limits on their options",
        },
        preferred_countries: {
          type: SchemaType.ARRAY, items: { type: SchemaType.STRING },
          description: "Destinations they have expressed interest in",
        },
        stage: {
          type: SchemaType.STRING, format: "enum",
          enum: ["exploring", "narrowing", "applying", "post_offer"],
          description: "Where they are in the journey",
        },
        notes: {
          type: SchemaType.ARRAY, items: { type: SchemaType.STRING },
          description: "Anything else worth remembering that has no field above",
        },
      },
    },
  },
  {
    name: "search_service_providers",
    description:
      "Find education agents and registered migration agents (MARA) who can help the student in person. " +
      "Use when the student asks who can help them apply, or for a migration agent.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { query: { type: SchemaType.STRING, description: "Location or provider name" } },
      required: ["query"],
    },
  },
];

/** Withheld on a discovery turn — see toolsFor(). */
const COURSE_TOOLS = new Set(["search_courses", "get_course_details"]);

/**
 * The tool set for a turn.
 *
 * Discovery turn (first message of a platform session) withholds the course tools
 * entirely rather than asking the model not to use them. The prompt-only version of
 * this rule did not hold: with matching courses available the model recommended
 * anyway. Structurally it cannot list courses it never retrieved.
 */
export function toolsFor(opts: { discoveryTurn?: boolean } = {}): Tool[] {
  const declarations = opts.discoveryTurn
    ? DECLARATIONS.filter((d) => !COURSE_TOOLS.has(d.name))
    : DECLARATIONS;
  return [{ functionDeclarations: declarations }];
}

/** User-facing labels for the thinking stream — the raw tool name is system internals. */
const TOOL_LABELS: Record<string, string> = {
  search_courses: "Searching courses",
  get_course_details: "Reading course details",
  search_knowledge: "Searching knowledge base",
  search_visas: "Searching visa records",
  search_institutions: "Searching institutions",
  search_service_providers: "Searching agents",
};

export const toolLabel = (name: string): string => TOOL_LABELS[name] ?? "Searching";

// ── Dispatcher ──

const str = (args: Record<string, unknown>, key: string): string | undefined => {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

/**
 * Run one tool call. Never throws: a failed tool returns an error payload so the
 * model can apologise or try something else, rather than killing the turn.
 */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolRun> {
  try {
    return await dispatch(name, args, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Tool failed", { name, err: message });
    return {
      result: { error: `${name} failed`, detail: message.slice(0, 200) },
      sources: [],
      trace: `${name} failed`,
    };
  }
}

/** Strings from a tool argument list, trimmed and emptied of junk. */
function strList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

const STAGES = new Set(["exploring", "narrowing", "applying", "post_offer"]);

async function dispatch(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolRun> {
  switch (name) {
    case "update_student_context": {
      const stage = str(args, "stage");
      const patch: CounsellingContext = {
        goals: strList(args.goals),
        interests: strList(args.interests),
        strengths: strList(args.strengths),
        constraints: strList(args.constraints),
        preferred_countries: strList(args.preferred_countries),
        notes: strList(args.notes),
        ...(stage && STAGES.has(stage) ? { stage: stage as CounsellingContext["stage"] } : {}),
      };
      const written = Object.entries(patch).filter(([, v]) => v != null).map(([k]) => k);
      if (!written.length) {
        return { result: { error: "Nothing to record" }, sources: [], trace: "No context to record" };
      }
      const context = await sessionsRepo.mergeContext(ctx.sessionId, patch);
      return {
        // Echo the merged context back: the model sees what is now on file, including
        // items it recorded earlier in the conversation.
        result: { recorded: written, context },
        sources: [],
        trace: `Noted: ${written.join(", ")}`,
      };
    }

    case "search_courses": {
      const query = str(args, "query") ?? "";
      const found = await knowledge.searchCourses({
        query,
        country: str(args, "country"),
        degreeLevel: str(args, "degree_level"),
        limit: MAX_COURSES,
      });
      const courses = await hydrate(found.map((c) => c.id));
      return {
        result: { courses: courses.map(courseForModel), count: courses.length },
        sources: courses.map((c) => ({ type: "course", id: c.id, title: c.name })),
        trace: `Searched courses: ${query}${args.country ? ` in ${args.country}` : ""} — ${courses.length} found`,
      };
    }

    case "get_course_details": {
      const id = str(args, "course_id");
      const course = id ? await knowledge.getCourseDetails(id) : undefined;
      if (!course) {
        return { result: { error: "No course with that id" }, sources: [], trace: "Course detail not found" };
      }
      return {
        result: {
          course: {
            ...courseForModel(course),
            description: course.description,
            campuses: course.campuses.map((c) => c.campus_name).filter(Boolean),
            study_units: course.study_units.map((u) => u.unit_name).filter(Boolean).slice(0, 30),
            accreditations: course.accreditations.map((a) => a.issuing_organization ?? a.name).filter(Boolean),
          },
        },
        sources: [{ type: "course", id: course.id, title: course.name }],
        trace: `Read course detail: ${course.name}`,
      };
    }

    case "search_knowledge": {
      const query = str(args, "query") ?? "";
      const countryCode = str(args, "country_code")?.toUpperCase() ?? null;
      const [visaRules, faqs, guides, passages] = await Promise.all([
        knowledge.searchKnowledgeVisas({ query, limit: 3 }),
        knowledge.searchKnowledgeFaqs({ query, limit: 5 }),
        knowledge.searchCountryGuides({ query, limit: 2 }),
        embeddingConfigured()
          ? embed(query).then((v) => knowledge.matchKnowledgeChunks(v, 8, countryCode))
          : Promise.resolve([]),
      ]);

      // Two chunks per document at most, so one long page can't fill every slot.
      const perDocument = new Map<string, number>();
      const chunks = passages.filter((p) => {
        const used = perDocument.get(p.document_id) ?? 0;
        if (used >= 2) return false;
        perDocument.set(p.document_id, used + 1);
        return true;
      });

      const sources: ToolSource[] = [
        ...visaRules.map((v) => ({
          type: "knowledge_visa", id: v.id, title: `${v.destination_country} ${v.visa_type}`,
        })),
        ...faqs.map((f) => ({ type: "faq", id: f.id, title: f.question })),
        ...guides.map((g) => ({ type: "country_guide", id: g.id, title: `${g.country} guide` })),
      ];
      const cited = new Set<string>();
      for (const c of chunks) {
        if (cited.has(c.document_id)) continue;
        cited.add(c.document_id);
        sources.push({
          type: "document",
          id: c.document_id,
          title: [c.title, c.heading_path].filter(Boolean).join(" › ") || c.source_domain,
        });
      }

      return {
        result: {
          // Authority is stated per item so the model can prefer official sources
          // and tell the student when sources disagree.
          passages: chunks.map((c) => ({
            heading: [c.title, c.heading_path].filter(Boolean).join(" › "),
            content: c.content,
            authority: c.trust_tier,
            source: c.source_type === "file" ? c.file_name : c.url,
            page: c.page_number,
          })),
          visa_rules: visaRules,
          faqs: faqs.map((f) => ({ question: f.question, answer: f.answer })),
          country_guides: guides,
        },
        sources,
        trace: `Searched knowledge: ${query}${countryCode ? ` (${countryCode})` : ""} — ${chunks.length} passages, ${visaRules.length + faqs.length + guides.length} curated`,
      };
    }

    case "search_visas": {
      const query = str(args, "query") ?? "";
      const visas = await knowledge.searchVisas({ query, limit: 5 });
      return {
        result: { visas },
        sources: visas.map((v) => ({
          type: "visa", id: v.id, title: v.name ?? v.subclass_code ?? "Visa",
        })),
        trace: `Searched visas: ${query} — ${visas.length} found`,
      };
    }

    case "search_institutions": {
      const query = str(args, "query") ?? "";
      const institutions = await knowledge.searchInstitutions({ query, limit: 5 });
      return {
        result: { institutions },
        sources: institutions.map((i) => ({
          type: "institution", id: i.id, title: i.name ?? "Institution",
        })),
        trace: `Searched institutions: ${query} — ${institutions.length} found`,
      };
    }

    case "search_service_providers": {
      const query = str(args, "query") ?? "";
      const [agents, maraAgents] = await Promise.all([
        knowledge.searchAgents({ query, limit: 5 }),
        knowledge.searchMaraAgents({ query, limit: 5 }),
      ]);
      return {
        result: { education_agents: agents, migration_agents: maraAgents },
        sources: [
          ...agents.map((a) => ({ type: "agent", id: a.id, title: a.name ?? "Agent" })),
          ...maraAgents.map((m) => ({
            type: "mara_agent", id: m.id, title: m.agent_name ?? m.business_name ?? m.marn,
          })),
        ],
        trace: `Searched service providers: ${query} — ${agents.length + maraAgents.length} found`,
      };
    }

    default:
      return { result: { error: `Unknown tool "${name}"` }, sources: [], trace: `Unknown tool ${name}` };
  }
}
