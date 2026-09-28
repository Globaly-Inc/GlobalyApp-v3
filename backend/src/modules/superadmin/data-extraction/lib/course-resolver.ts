/**
 * Entity resolution for courses: is the incoming course one we already hold for this institution?
 *
 * Pure decision over candidate rows the caller fetched (same institution_key). Three tiers, first
 * one that decides wins, each with a printable reason:
 *   1 identical   — same identity key, or same own-page URL with the same qualification, or the
 *                   same institution code. Merge.
 *   2 variant     — same qualification, subject and specialisation; only delivery flags differ
 *                   ("with Placement Year"). Link, keep both.
 *   2b/2c/3 possible_duplicate — same qualification and subject with the specialisation missing on
 *                   one side, or a near-identical subject text (2b/3, same qualification on both
 *                   sides); or same subject and specialisation with the QUALIFICATION missing on
 *                   exactly one side (2c) — the shape of a subject/department hub mention ("Data
 *                   Science" off an area-of-study index page) beside the actual qualified programme
 *                   ("Data Science Graduate Certificate"). Flag for review, keep both — never merge:
 *                   a bare mention can just as easily sit beside TWO different real qualified
 *                   programmes (a subject's undergrad AND grad pages), and nothing about the bare
 *                   name alone says which, if either, it duplicates.
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
  matches?: CandidateRow[];
  tier: "1" | "2" | "2b" | "2c" | "3" | null;
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

  // Tier 2c — same subject and specialisation, but only ONE side names a qualification at all. A
  // subject/department hub page ("Data Science" off an area-of-study index) routinely produces a
  // bare mention of a programme whose own page states an award ("Data Science Graduate
  // Certificate") — same identity question as 2b, just on the qualifier instead of the
  // specialisation, and gated shut everywhere else in this file by qualifier equality. Flag only:
  // a bare mention can sit beside two DIFFERENT real qualified programmes (a subject's undergrad and
  // grad pages both reducing to the same subject/specialisation), so nothing here may merge — and
  // two candidates that both state a (different) qualifier never reach this loop at all.
  // Collects EVERY qualifying candidate rather than stopping at the first: if both an undergrad and
  // a grad programme for the same subject are already staged, the bare mention duplicates either
  // (or neither) of them, and a reviewer needs to see both, not whichever happened to come first.
  // Requires a non-empty subject: a name whose only content words are stopwords ("Online Courses",
  // "Doctoral Program") parses to subject="" and must never anchor a match — every such name would
  // otherwise look identical to every other one.
  const bareQualifierMatches = p.subject ? candidates.filter((c) =>
    !codeConflicts(c) &&
    (c.qualifier_norm == null) !== (p.qualifier == null) &&
    (c.subject_norm ?? "") === p.subject &&
    (c.specialisation_norm ?? null) === (p.specialisation ?? null)) : [];
  if (bareQualifierMatches.length) {
    return scoped({
      outcome: "possible_duplicate", match: bareQualifierMatches[0], matches: bareQualifierMatches,
      tier: "2c", reason: "qualifier_missing_one_side",
    });
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
