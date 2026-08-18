// Fixtures for the AI Knowledge retrieval tests and the recall@5 gate.
//
// Two things live here:
//
//   1. A stub EmbeddingProvider. It has to be a stub: this environment has no
//      GEMINI_API_KEY, and lib/embedding-provider.ts deliberately refuses to invent
//      one. The stub is a *lexical-semantic* embedder — it normalises synonyms into
//      a small canonical vocabulary and then hashes the resulting token bag into the
//      3072 buckets the column is wide. That gives it the one property the vector leg
//      is there for (a question worded differently from the document still matches)
//      and the one weakness it really has (it cannot see a chunk that has no vector).
//      It is not a model and does not pretend to be; it is a fixed, reproducible
//      relevance function the gate can be built on.
//
//   2. A 16-document corpus and a 12-question set, deliberately mixed so that some
//      questions are answerable only by the vector leg, some only by the text leg,
//      and some by both. The point of the mix is that it is the real operating
//      condition: V3 ships with 207 documents and 0 embeddings, so retrieval has to
//      work over a partially embedded corpus, not just a finished one.

import { createHash } from "node:crypto";
import { masterKnex } from "../../src/core/db/master-pool.js";
import { EMBEDDING_DIMS } from "../../src/modules/superadmin/data-extraction/lib/llm-client.js";
import type { EmbeddingProvider } from "../../src/modules/superadmin/ai-knowledge/lib/embedding-provider.js";

export const STUB_MODEL = "stub-lexical-semantic-001";

// ── The stub embedder ────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "am",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "can", "shall", "must", "i", "me", "my", "we", "our", "you",
  "your", "it", "its", "they", "them", "their", "what", "which", "who", "how",
  "where", "when", "why", "this", "that", "these", "those", "in", "on", "at",
  "to", "for", "of", "with", "by", "from", "about", "into", "through", "and",
  "or", "but", "not", "no", "so", "if", "as", "up", "out", "also", "any", "all",
]);

/**
 * The canonical vocabulary. This is the only "semantic" thing about the stub, and
 * it is the thing a real embedding model does implicitly: "study permit" and
 * "student visa" are the same concept, "price" and "tuition" are the same concept.
 * Postgres full-text has no such notion, which is exactly why the two legs disagree.
 */
const SYNONYMS: Record<string, string> = {
  // visas
  permit: "visa", permits: "visa", subclass: "visa", route: "visa",
  // countries
  aussie: "australia", au: "australia", australian: "australia",
  britain: "uk", england: "uk", british: "uk", "u.k": "uk",
  canadian: "canada", ca: "canada",
  // money
  price: "fee", prices: "fee", cost: "fee", costs: "fee", tuition: "fee",
  fees: "fee", pay: "fee", paying: "fee", expensive: "fee",
  // housing
  rent: "housing", rental: "housing", accommodation: "housing",
  residence: "housing", apartment: "housing", dorm: "housing", room: "housing",
  house: "housing", flat: "housing", live: "housing", living: "housing",
  // health
  insurance: "health", medical: "health", oshc: "health", healthcare: "health",
  surcharge: "health", cover: "health", coverage: "health",
  // levels
  bachelor: "undergraduate", bachelors: "undergraduate", undergrad: "undergraduate",
  masters: "postgraduate", postgrad: "postgraduate", phd: "postgraduate",
  // work
  job: "work", jobs: "work", working: "work", employment: "work", employed: "work",
  // funding
  scholarship: "funding", scholarships: "funding", bursary: "funding",
  bursaries: "funding", grant: "funding", grants: "funding", funded: "funding",
  // english
  ielts: "english", toefl: "english", pte: "english", language: "english",
  // residency
  pr: "residency", immigration: "residency", migrate: "residency",
  permanent: "residency",
  // process
  apply: "apply", application: "apply", applying: "apply", lodge: "apply",
  admission: "apply", admissions: "apply", enrol: "apply", enrolment: "apply",
  // misc
  overseas: "international", foreign: "international",
  hours: "hour", weeks: "week", weekly: "week", years: "year", months: "month",
  students: "student", studying: "study", studies: "study", courses: "course",
  universities: "university", degrees: "degree", programmes: "programme",
  programs: "programme",
};

function canonicalTokens(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const out: string[] = [];
  for (const word of raw) {
    if (STOPWORDS.has(word)) continue;
    const canonical = SYNONYMS[word] ?? (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word);
    if (STOPWORDS.has(canonical)) continue;
    out.push(canonical);
  }
  return out;
}

/** Stable bucket for a token — deterministic across runs and machines. */
function bucketOf(token: string): number {
  const digest = createHash("sha1").update(token).digest();
  return digest.readUInt32BE(0) % EMBEDDING_DIMS;
}

/** Sub-linear term weighting, so one word repeated 40 times cannot dominate. */
export function stubEmbed(text: string): number[] {
  const counts = new Map<string, number>();
  for (const token of canonicalTokens(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const vector = new Array<number>(EMBEDDING_DIMS).fill(0);
  for (const [token, count] of counts) {
    vector[bucketOf(token)] += 1 + Math.log(count);
  }

  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  // A text with nothing but stopwords has no direction. Return zeroes rather than
  // NaNs — the caller (a test) will notice an empty result, which is the truth.
  return norm > 0 ? vector.map((v) => v / norm) : vector;
}

export function makeStubEmbedder(model = STUB_MODEL): EmbeddingProvider {
  return {
    model,
    dims: EMBEDDING_DIMS,
    embedBatch: async (texts: string[]) => texts.map(stubEmbed),
  };
}

/** A provider that always throws, for the "no key" paths. */
export function makeFailingEmbedder(error: Error): EmbeddingProvider {
  return {
    model: STUB_MODEL,
    dims: EMBEDDING_DIMS,
    embedBatch: async () => {
      throw error;
    },
  };
}

// ── The corpus ───────────────────────────────────────────────────────────────

export interface CorpusDoc {
  key: string;
  title: string;
  markdown: string;
  /**
   * Whether this document's chunks get vectors. Four are left unembedded on
   * purpose: that is the state the corpus is actually in (207 documents, 0
   * embeddings), and a retrieval design that only works at 100% coverage is not
   * the design we want.
   */
  embed: boolean;
}

export const KNOWLEDGE_CORPUS: CorpusDoc[] = [
  {
    key: "au-visa-work",
    title: "Student visa work rights in Australia",
    markdown:
      "Holders of the Australian student visa subclass 500 may work up to 48 hours per fortnight " +
      "while their course of study is in session, and unlimited hours during scheduled course breaks. " +
      "Working more hours than the visa permits can lead to cancellation.",
    embed: true,
  },
  {
    key: "au-visa-apply",
    title: "Applying for the Australian student visa",
    markdown:
      "You lodge the subclass 500 student visa application online through ImmiAccount after receiving " +
      "a Confirmation of Enrolment from your Australian university. The application must include a " +
      "Genuine Student requirement statement, evidence of funds, and OSHC health cover.",
    embed: true,
  },
  {
    key: "au-oshc",
    title: "Overseas Student Health Cover in Australia",
    markdown:
      "OSHC is the mandatory health insurance every Australian student visa holder must hold. The cover " +
      "has to run for the whole period of the visa. Single cover costs roughly 500 to 700 AUD per year " +
      "and is arranged before the student arrives.",
    embed: true,
  },
  {
    key: "au-fees",
    title: "Tuition fees at Australian universities",
    markdown:
      "International undergraduate tuition fees in Australia typically range from 30,000 to 45,000 AUD " +
      "per year. Postgraduate coursework degrees cost between 32,000 and 50,000 AUD per year. Fees are " +
      "charged per unit of study, so a lighter study load costs less per semester.",
    embed: true,
  },
  {
    key: "au-housing",
    title: "Student accommodation in Australia",
    markdown:
      "On-campus student accommodation in Australia costs 250 to 500 AUD per week. Shared private " +
      "rentals in Melbourne and Sydney cost 180 to 350 AUD per week plus utilities. Most students " +
      "living on campus in their first year move to a shared house afterwards.",
    embed: true,
  },
  {
    key: "ca-visa-sds",
    title: "Canadian study permit and the Student Direct Stream",
    markdown:
      "The Student Direct Stream offers faster study permit processing for applicants from participating " +
      "countries who hold a Guaranteed Investment Certificate of 20,635 CAD, have paid their first year " +
      "of tuition, and meet the language requirement.",
    embed: false,
  },
  {
    key: "ca-visa-work",
    title: "Working on a Canadian study permit",
    markdown:
      "Study permit holders enrolled full time at a designated learning institution in Canada may work " +
      "up to 24 hours per week off campus during academic sessions, and full time during scheduled " +
      "breaks. No separate work permit is needed.",
    embed: true,
  },
  {
    key: "ca-fees",
    title: "Tuition fees in Canada",
    markdown:
      "International undergraduate tuition fees in Canada range from 20,000 to 40,000 CAD per year. " +
      "Graduate programmes cost 15,000 to 30,000 CAD per year. Quebec institutions charge separate " +
      "rates from the rest of Canada.",
    embed: true,
  },
  {
    key: "ca-housing",
    title: "Student housing in Canada",
    markdown:
      "University residence in Canada costs 8,000 to 12,000 CAD per academic year. Off-campus shared " +
      "apartments in Toronto and Vancouver rent for 900 to 1,600 CAD per month for a student. Utilities " +
      "are usually extra outside residence.",
    embed: true,
  },
  {
    key: "uk-visa-apply",
    title: "Applying for the UK Student route visa",
    markdown:
      "The Student route visa replaced Tier 4. You need a Confirmation of Acceptance for Studies from a " +
      "licensed sponsor, proof of maintenance funds held for 28 consecutive days, and payment of the " +
      "Immigration Health Surcharge before the visa is granted.",
    embed: false,
  },
  {
    key: "uk-visa-work",
    title: "Working on the UK Student route visa",
    markdown:
      "Student route visa holders on a degree level course in the UK may work up to 20 hours per week " +
      "during term time and full time outside term time. Self-employment and professional sport are " +
      "not permitted.",
    embed: true,
  },
  {
    key: "uk-fees",
    title: "Tuition fees at UK universities",
    markdown:
      "International undergraduate tuition fees in the UK range from 12,000 to 38,000 GBP per year. " +
      "Medicine and dentistry cost considerably more. Postgraduate taught degrees are usually a single " +
      "year, so the total fee is lower than a three year undergraduate course.",
    embed: true,
  },
  {
    key: "uk-ihs",
    title: "The Immigration Health Surcharge",
    markdown:
      "The Immigration Health Surcharge gives UK Student route visa holders access to the National " +
      "Health Service on the same basis as a resident. Students pay a discounted annual rate for the " +
      "duration of the visa plus any grace period.",
    embed: true,
  },
  {
    key: "english-tests",
    title: "English language requirements for international students",
    markdown:
      "Most universities accept IELTS Academic, TOEFL iBT or PTE Academic. A typical undergraduate " +
      "entry requirement is IELTS 6.0 overall with no band below 5.5. Postgraduate courses usually ask " +
      "for IELTS 6.5 overall with no band below 6.0.",
    embed: false,
  },
  {
    key: "scholarships",
    title: "Scholarships and funding for international students",
    markdown:
      "Government scholarships such as Australia Awards, the Vanier Canada Graduate Scholarships and " +
      "Chevening in the UK cover tuition and living costs for international students. Universities also " +
      "award merit bursaries and grants that reduce tuition directly, and funding is usually decided " +
      "with the offer.",
    embed: true,
  },
  {
    key: "post-study",
    title: "Post-study work and permanent residency pathways",
    markdown:
      "Australia's Temporary Graduate visa subclass 485, Canada's Post-Graduation Work Permit and the " +
      "UK Graduate route all let graduates stay and work after finishing a degree. Each is a common " +
      "pathway toward permanent residency, though none of them guarantees it.",
    embed: false,
  },
];

// ── The question set ─────────────────────────────────────────────────────────

/** Which leg is expected to be able to answer a question at all. */
export type Findable = "vector" | "text" | "both";

export interface RecallQuery {
  id: string;
  query: string;
  /** The corpus key that answers it. Recall is measured on document identity. */
  expect: string;
  findable: Findable;
}

/**
 * 12 questions, mixed on purpose:
 *
 *   findable: "vector"  the question is worded nothing like the document, so
 *                       websearch_to_tsquery ANDs a lexeme the document does not
 *                       contain and the text leg returns nothing at all.
 *   findable: "text"    the answer lives in a document whose chunks have no vector
 *                       yet, so the vector leg cannot see it — the ordinary state of
 *                       a corpus mid-backfill.
 *   findable: "both"    the wording matches and the document is embedded.
 */
export const RECALL_QUERIES: RecallQuery[] = [
  { id: "q01", query: "how many hours can I work on an aussie study permit", expect: "au-visa-work", findable: "vector" },
  { id: "q02", query: "what does it cost to rent a place in Toronto as a student", expect: "ca-housing", findable: "vector" },
  { id: "q03", query: "price of a bachelor degree in Britain", expect: "uk-fees", findable: "vector" },
  { id: "q04", query: "medical insurance I have to buy before flying to Australia", expect: "au-oshc", findable: "vector" },
  { id: "q05", query: "bursaries for overseas students", expect: "scholarships", findable: "vector" },

  { id: "q06", query: "Confirmation of Acceptance for Studies licensed sponsor", expect: "uk-visa-apply", findable: "text" },
  { id: "q07", query: "Student Direct Stream Guaranteed Investment Certificate", expect: "ca-visa-sds", findable: "text" },
  { id: "q08", query: "IELTS 6.5 overall postgraduate courses", expect: "english-tests", findable: "text" },
  { id: "q09", query: "Post-Graduation Work Permit Graduate route", expect: "post-study", findable: "text" },

  { id: "q10", query: "student visa work hours per fortnight Australia", expect: "au-visa-work", findable: "both" },
  { id: "q11", query: "on-campus student accommodation cost per week Australia", expect: "au-housing", findable: "both" },
  { id: "q12", query: "Immigration Health Surcharge National Health Service", expect: "uk-ihs", findable: "both" },
];

// ── Seeding ──────────────────────────────────────────────────────────────────

const S = "superadmin";
export const FIXTURE_CATEGORY_SLUG = "e1-recall-fixture";

export interface SeededCorpus {
  categoryId: string;
  sourceId: string;
  /** corpus key → ai_knowledge_documents.id */
  documentIds: Map<string, string>;
}

const hashOf = (text: string) => createHash("sha256").update(text).digest("hex");

/** Removes anything a previous run of these fixtures left behind. */
export async function resetKnowledgeCorpus(): Promise<void> {
  const categories = await masterKnex(`${S}.ai_knowledge_categories`)
    .whereLike("slug", `${FIXTURE_CATEGORY_SLUG}%`)
    .pluck("id");
  if (categories.length) {
    // documents and chunks cascade from categories/sources.
    await masterKnex(`${S}.ai_knowledge_categories`).whereIn("id", categories).delete();
  }
}

export interface SeedOptions {
  /** Marks the fixture set so parallel suites cannot collide. */
  suffix?: string;
  countryCode?: string | null;
  kind?: string;
  /** Deactivate these corpus keys' documents, to prove they stop being retrievable. */
  inactiveDocuments?: string[];
  /** Deactivate the whole source, same reason. */
  inactiveSource?: boolean;
}

export async function seedKnowledgeCorpus(options: SeedOptions = {}): Promise<SeededCorpus> {
  const slug = `${FIXTURE_CATEGORY_SLUG}${options.suffix ? `-${options.suffix}` : ""}`;

  const [category] = await masterKnex(`${S}.ai_knowledge_categories`)
    .insert({
      slug,
      label: "E1 recall fixture",
      kind: options.kind ?? "immigration",
      country_code: options.countryCode ?? null,
      active: true,
      sort_order: 0,
    })
    .returning("id");

  const [source] = await masterKnex(`${S}.ai_knowledge_sources`)
    .insert({
      category_id: category.id,
      url: `https://fixture.invalid/${slug}`,
      domain: "fixture.invalid",
      title: "E1 fixture source",
      trust_tier: "official",
      crawl_frequency: "off",
      active: options.inactiveSource !== true,
      added_via: "test",
    })
    .returning("id");

  const inactive = new Set(options.inactiveDocuments ?? []);
  const documentIds = new Map<string, string>();

  for (const doc of KNOWLEDGE_CORPUS) {
    const [row] = await masterKnex(`${S}.ai_knowledge_documents`)
      .insert({
        source_id: source.id,
        category_id: category.id,
        url: `https://fixture.invalid/${slug}/${doc.key}`,
        title: doc.title,
        markdown: doc.markdown,
        content_hash: hashOf(doc.markdown),
        word_count: doc.markdown.split(/\s+/).length,
        active: !inactive.has(doc.key),
      })
      .returning("id");
    documentIds.set(doc.key, row.id);
  }

  return { categoryId: category.id, sourceId: source.id, documentIds };
}

// ── Recall measurement ───────────────────────────────────────────────────────

/** V2's gate: recall@5 must stay at or above 0.85 (eval/retrieval/run.mjs). */
export const RECALL_K = 5;
export const RECALL_THRESHOLD = 0.85;

export interface RecallReport {
  k: number;
  /** Macro-averaged recall@k over the question set — V2's definition. */
  recall: number;
  /** Mean reciprocal rank, for context when recall is flat. */
  mrr: number;
  hits: string[];
  misses: string[];
}

/**
 * Recall@k over document identity, not chunk identity: two chunks of the right
 * document is one correct answer, not two.
 */
export function recallReport(
  k: number,
  outcomes: Array<{ id: string; expectedDocumentId: string; documentIds: string[] }>,
): RecallReport {
  const hits: string[] = [];
  const misses: string[] = [];
  let sumRecall = 0;
  let sumRr = 0;

  for (const outcome of outcomes) {
    const top = [...new Set(outcome.documentIds)].slice(0, k);
    const rank = top.indexOf(outcome.expectedDocumentId);
    if (rank === -1) {
      misses.push(outcome.id);
    } else {
      hits.push(outcome.id);
      sumRecall += 1;
      sumRr += 1 / (rank + 1);
    }
  }

  const n = outcomes.length || 1;
  return {
    k,
    recall: Number((sumRecall / n).toFixed(3)),
    mrr: Number((sumRr / n).toFixed(3)),
    hits,
    misses,
  };
}

export class RecallGateFailure extends Error {}

/**
 * The gate itself, as a function rather than an inline expect(): a gate is only
 * worth having if it can be pointed at a degraded configuration and shown to fail,
 * and that requires calling it deliberately. Throws RecallGateFailure below the
 * threshold.
 */
export function assertRecallGate(
  label: string,
  report: RecallReport,
  threshold = RECALL_THRESHOLD,
): void {
  if (report.recall < threshold) {
    throw new RecallGateFailure(
      `recall@${report.k} for ${label} is ${report.recall.toFixed(3)}, below the ${threshold} gate. ` +
        `Missed: ${report.misses.join(", ") || "none"}`,
    );
  }
}

/** One line per configuration, so a CI log carries the numbers and not just a pass. */
export function formatRecallTable(rows: Array<[string, RecallReport]>): string {
  const lines = [`configuration      recall@${RECALL_K}   mrr     misses`];
  for (const [label, report] of rows) {
    lines.push(
      `${label.padEnd(18)} ${report.recall.toFixed(3).padEnd(9)} ${report.mrr.toFixed(3).padEnd(7)} ` +
        `${report.misses.join(",") || "-"}`,
    );
  }
  return lines.join("\n");
}
