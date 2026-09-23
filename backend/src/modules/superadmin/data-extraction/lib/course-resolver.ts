/**
 * Entity resolution for courses: is the incoming course one we already hold for this institution?
 *
 * Pure decision over candidate rows the caller fetched (same institution_key). Three tiers, first
 * one that decides wins, each with a printable reason:
 *   1 identical   — same identity key, or same own-page URL with the same qualification, or the
 *                   same institution code. Merge.
 *   2 variant     — same qualification, subject and specialisation; only delivery flags differ
 *                   ("with Placement Year"). Link, keep both.
 *   2b/3 possible_duplicate — same qualification and subject with the specialisation missing on one
 *                   side, or a near-identical subject text. Flag for review, keep both.
 *   new           — nothing above.
 *
 * Similarity NEVER merges: on the live table 5,505 in-job pairs score >= 0.6 and nearly all are
 * sibling specialisations. A cross-job match is downgraded to possible_duplicate: two jobs for one
 * institution mean a re-run, and attaching a new run's data onto an old job's row is a product call
 * the admin makes in review, not something the writer does silently.
 */
import type { ParsedCourseName } from "./course-name.js";

export interface CandidateRow {
  id: string;
  job_id: string;
  institution_key: string | null;
  name_key: string | null;
  qualifier_norm: string | null;
  subject_norm: string | null;
  specialisation_norm: string | null;
  variant_flags: string[] | null;
  course_code: string | null;
  canonical_url: string | null;
}

export interface Incoming {
  jobId: string;
  parsed: ParsedCourseName;
  canonicalUrl: string | null;
}

export type ResolutionOutcome = "identical" | "variant" | "possible_duplicate" | "new";

export interface Resolution {
  outcome: ResolutionOutcome;
  match: CandidateRow | null;
  tier: "1" | "2" | "2b" | "3" | null;
  reason: string | null;
}

export const FUZZY_THRESHOLD = 0.85;

function sameFlags(a: string[] | null, b: string[]): boolean {
  return (a ?? []).slice().sort().join(",") === b.slice().sort().join(",");
}

/** Trigram similarity, the same measure pg_trgm uses, so the SQL candidate query and this agree. */
export function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const set = new Set<string>();
    for (const w of s.toLowerCase().split(/\s+/).filter(Boolean)) {
      const p = `  ${w} `;
      for (let i = 0; i + 3 <= p.length; i++) set.add(p.slice(i, i + 3));
    }
    return set;
  };
  const ga = grams(a), gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return inter / (ga.size + gb.size - inter);
}

export function resolveCourse(incoming: Incoming, candidates: CandidateRow[]): Resolution {
  const p = incoming.parsed;
  const codeConflicts = (c: CandidateRow) => !!(p.code && c.course_code && p.code !== c.course_code);
  const scoped = (r: Resolution): Resolution => {
    if (r.match && r.match.job_id !== incoming.jobId && r.outcome !== "new") {
      return { ...r, outcome: "possible_duplicate", reason: `cross_job:${r.reason}` };
    }
    return r;
  };

  // Tier 1 — identity.
  for (const c of candidates) {
    if (codeConflicts(c)) continue;
    if (c.name_key && c.name_key === p.key) return scoped({ outcome: "identical", match: c, tier: "1", reason: "name_key" });
  }
  for (const c of candidates) {
    if (codeConflicts(c)) continue;
    if (incoming.canonicalUrl && c.canonical_url === incoming.canonicalUrl && (c.qualifier_norm ?? null) === (p.qualifier ?? null)) {
      return scoped({ outcome: "identical", match: c, tier: "1", reason: "own_url" });
    }
    if (p.code && c.course_code === p.code && (c.qualifier_norm ?? null) === (p.qualifier ?? null)) {
      return scoped({ outcome: "identical", match: c, tier: "1", reason: "course_code" });
    }
  }

  // Tier 2 — same qualification and subject.
  const sameQualSubject = candidates.filter((c) =>
    !codeConflicts(c) && (c.qualifier_norm ?? null) === (p.qualifier ?? null) && (c.subject_norm ?? "") === p.subject);
  for (const c of sameQualSubject) {
    if ((c.specialisation_norm ?? null) === (p.specialisation ?? null) && !sameFlags(c.variant_flags, p.flags)) {
      return scoped({ outcome: "variant", match: c, tier: "2", reason: "flags_differ" });
    }
  }
  for (const c of sameQualSubject) {
    const one = (c.specialisation_norm ?? null) === null !== ((p.specialisation ?? null) === null);
    if (one) return scoped({ outcome: "possible_duplicate", match: c, tier: "2b", reason: "specialisation_missing_one_side" });
  }

  // Tier 3 — fuzzy, flag only.
  if (p.qualifier) {
    for (const c of candidates) {
      if (codeConflicts(c) || (c.qualifier_norm ?? null) !== p.qualifier) continue;
      const a = `${p.subject} ${p.specialisation ?? ""}`.trim();
      const b = `${c.subject_norm ?? ""} ${c.specialisation_norm ?? ""}`.trim();
      if (a && b && a !== b) {
        const sim = trigramSimilarity(a, b);
        if (sim >= FUZZY_THRESHOLD) {
          return scoped({ outcome: "possible_duplicate", match: c, tier: "3", reason: `trigram:${sim.toFixed(2)}` });
        }
      }
    }
  }
  return { outcome: "new", match: null, tier: null, reason: null };
}
