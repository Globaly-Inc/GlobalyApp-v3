// The only door between the quality validator and the LLM.
//
// FAIL CLOSED, the same contract as ai-knowledge/lib/embedding-provider.ts and
// shared/ai/gemini.ts: a deployment with no Gemini key answers 503. There is
// deliberately no offline stub and no "assume it's fine" fallback — a validator
// that cannot fail is worse than no validator, because a clean verdict it did not
// earn is what an operator will act on.
//
// The caller runs its auth, its validation and ALL of its database work first and
// only then asks for a provider, so without a key the deterministic flags are
// still persisted and the response reports honestly how many courses are awaiting
// a judgement call. Tests inject their own QualityProvider; they never read the env.

import { AppError } from "../../../../shared/errors.js";
import { config } from "../../../../config.js";
import { extractJson } from "./llm-client.js";
import { qualityAuditPrompt, QUALITY_AUDIT_SYSTEM } from "./extraction-prompts.js";
import {
  QUALITY_ISSUE_TYPES,
  QUALITY_SEVERITIES,
  type CourseUnderAudit,
  type QualityIssue,
} from "./quality-rules.js";

export class QualityProviderUnavailableError extends AppError {
  constructor(message = "Quality validator LLM is not configured") {
    super(message, 503, "QUALITY_PROVIDER_UNAVAILABLE");
  }
}

export interface QualityJudgement {
  issues: QualityIssue[];
  summary: string;
}

export interface QualityProvider {
  /** Recorded on the run so a model change is visible without a migration. */
  readonly model: string;
  /** The two rules that need judgement: contradiction and nonsensical_name. */
  judge(courses: readonly CourseUnderAudit[], institutionName: string): Promise<QualityJudgement>;
}

export function isQualityProviderConfigured(): boolean {
  return !!config.GEMINI_API_KEY;
}

/** Readable without a key, so pending courses report the model they are waiting for. */
export function currentQualityModel(): string {
  return config.GEMINI_MODEL;
}

export function getQualityProvider(): QualityProvider {
  if (!isQualityProviderConfigured()) throw new QualityProviderUnavailableError();
  // Built per call, not at module load: config is mutable and the model may be
  // switched between runs, which is why it is recorded per run.
  return { model: currentQualityModel(), judge };
}

async function judge(
  courses: readonly CourseUnderAudit[],
  institutionName: string,
): Promise<QualityJudgement> {
  const parsed = await extractJson<{ issues?: unknown; summary?: unknown }>({
    system: QUALITY_AUDIT_SYSTEM,
    prompt: qualityAuditPrompt(courses, institutionName),
  });

  const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
  return {
    // Shape only; keepKnownCourses() does the id/enum validation before any write.
    issues: issues.filter(isIssueShaped).map(normaliseSeverity),
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
  };
}

function isIssueShaped(value: unknown): value is QualityIssue {
  const issue = value as Partial<QualityIssue> | null;
  return (
    !!issue &&
    typeof issue.course_id === "string" &&
    typeof issue.issue_type === "string" &&
    // Judgement rules only — the deterministic three are not the model's job, and
    // letting it re-file them would double-count every flag already computed.
    (issue.issue_type === "contradiction" || issue.issue_type === "nonsensical_name") &&
    QUALITY_ISSUE_TYPES.includes(issue.issue_type) &&
    typeof issue.suggestion === "string"
  );
}

/** V1 specifies severity=high for both judgement rules; a bad value is not a reason to drop the flag. */
function normaliseSeverity(issue: QualityIssue): QualityIssue {
  return QUALITY_SEVERITIES.includes(issue.severity) ? issue : { ...issue, severity: "high" };
}
