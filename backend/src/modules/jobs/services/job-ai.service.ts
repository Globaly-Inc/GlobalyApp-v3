// V1's job-ai-assist and job-match-score, in V3 shape.
//
// FAIL CLOSED (§1.6). Auth → zod → database work → `assertConfigured()` → provider.
// With no GEMINI_API_KEY the last step throws 503 and nothing has been written.
//
// This is deliberately NOT what V1 did for match-score: V1 answered 200 with
// {label: "Good Match", score: 50, reasons: ["AI scoring unavailable"]} whenever
// the key was missing or the gateway failed. A student cannot tell that apart from
// a real assessment, so it is a defect, not a spec, and §1.6's fail-closed rule
// overrides it.

import { assertConfigured, generateText, isConfigured } from "../../../shared/ai/gemini.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors.js";
import { masterKnex } from "../../../core/db/master-pool.js";
import * as jobRepo from "../repositories/jobs.repository.js";
import type { AiAssistInput } from "../schemas/jobs.schema.js";
import type { AiAssistType } from "../consts.js";

export { isConfigured };

/** V1 truncated every interpolated value; unbounded user text is a prompt-injection surface. */
function sanitize(value: unknown, maxLen = 2000): string {
  return String(value ?? "").trim().slice(0, maxLen);
}

const SYSTEM: Record<AiAssistType, string> = {
  cover_letter: "You write concise, professional cover letters for international students.",
  optimize_post: "You are a job posting optimization expert.",
  applicant_summary: "You summarize job applicants objectively for employers.",
};

/** The three V1 prompts, field for field. */
function buildPrompt(type: AiAssistType, context: Record<string, unknown>): string {
  switch (type) {
    case "cover_letter":
      return [
        "Write a professional, concise cover letter for an international student applying to this job.",
        "",
        `Job Title: ${sanitize(context.jobTitle, 200)}`,
        `Company: ${sanitize(context.companyName, 200)}`,
        `Job Description: ${sanitize(context.jobDescription, 3000)}`,
        "",
        "Write a 200-300 word cover letter. Be professional but warm. Highlight relevant skills and enthusiasm. Do not include addresses or dates.",
      ].join("\n");
    case "optimize_post":
      return [
        "Review and improve this job posting.",
        "",
        `Title: ${sanitize(context.title, 200)}`,
        `Description: ${sanitize(context.description, 3000)}`,
        `Job Type: ${sanitize(context.jobType, 50)}`,
        `Category: ${sanitize(context.category, 50)}`,
        "",
        "Return ONLY the improved description text. Do not include JSON or extra formatting.",
      ].join("\n");
    case "applicant_summary":
      return [
        "Summarize this job applicant in a concise card format for an employer.",
        "",
        `Applicant: ${sanitize(context.applicantName, 200)}`,
        `Cover Letter: ${sanitize(context.coverLetter, 2000)}`,
        `Job Title: ${sanitize(context.jobTitle, 200)}`,
        "",
        "Write a 2-3 sentence summary highlighting key strengths and any potential concerns. Be objective and concise.",
      ].join("\n");
  }
}

export async function assist(input: AiAssistInput): Promise<{ result: string }> {
  const prompt = buildPrompt(input.type, input.context);
  assertConfigured();
  return {
    result: await generateText({
      system: SYSTEM[input.type],
      prompt,
      temperature: 0.7,
    }),
  };
}

export interface MatchScore {
  label: string;
  score: number;
  reasons: string[];
}

const MATCH_SYSTEM = "You are a job matching assistant for international students.";
const VALID_LABELS = ["Strong Match", "Good Match", "Stretch"];

/**
 * Parses the model's JSON. A response we cannot read is an error, not a default —
 * V1 fell back to {score: 50, reasons: ["Unable to parse AI response"]}, which is
 * the same fabrication problem in a different disguise.
 */
export function parseMatchScore(text: string): MatchScore {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new BadRequestError("AI returned no usable match score");
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new BadRequestError("AI returned no usable match score");
  }
  const obj = parsed as Partial<MatchScore>;
  const score = Number(obj.score);
  if (!VALID_LABELS.includes(String(obj.label)) || !Number.isFinite(score) || score < 0 || score > 100) {
    throw new BadRequestError("AI returned no usable match score");
  }
  return {
    label: String(obj.label),
    score,
    reasons: Array.isArray(obj.reasons) ? obj.reasons.map((r) => String(r)).slice(0, 5) : [],
  };
}

function buildMatchPrompt(job: jobRepo.JobRow, profile: Record<string, unknown>): string {
  return [
    "Score the fit between this student and job.",
    "",
    "JOB:",
    `- Title: ${sanitize(job.title, 200)}`,
    `- Type: ${sanitize(job.job_type, 50)}`,
    `- Location: ${sanitize(job.location_city, 100)}, ${sanitize(job.country_name, 100)}`,
    `- Remote: ${job.is_remote}`,
    `- Category: ${sanitize(job.category, 50) || "general"}`,
    `- Skills: ${(job.skill_tags ?? []).join(", ")}`,
    `- Work rights required: ${job.work_rights_required}`,
    `- Visa types allowed: ${(job.visa_types_allowed ?? []).join(", ")}`,
    "",
    "STUDENT:",
    `- Nationality: ${sanitize(profile.nationality_name, 100) || "unknown"}`,
    `- Country of residence: ${sanitize(profile.residence_name, 100) || "unknown"}`,
    `- City: ${sanitize(profile.city_of_residence, 100) || "unknown"}`,
    `- Highest degree: ${sanitize(profile.highest_degree_level, 100) || "unknown"}`,
    `- Field of study: ${sanitize(JSON.stringify(profile.fields_of_study ?? []), 300)}`,
    "",
    'Return ONLY valid JSON with this structure:',
    '{"label": "Strong Match" | "Good Match" | "Stretch", "score": 0-100, "reasons": ["reason1", "reason2", "reason3"]}',
  ].join("\n");
}

/**
 * V1 charged 5 credits before calling the gateway, then returned a fabricated
 * score when the call failed — so a student could pay for nothing. This wave keeps
 * the assessment free.
 *
 * ponytail: no credit spend here. Adding one needs a `job_match` entry in
 * ai-counsellor's CreditReason vocabulary (another wave's file), and with the
 * provider unreachable in this environment the charge path could never be
 * exercised or tested. Charge on a *successful* generation when that lands.
 */
export async function matchScore(jobId: number, userId: number): Promise<MatchScore> {
  const job = await jobRepo.findById(jobId);
  if (!job || job.status !== "open") throw new NotFoundError("Job not found");

  const profile = await masterKnex("platform_user_profiles as p")
    .leftJoin("countries as nat", "nat.id", "p.nationality_id")
    .leftJoin("countries as res", "res.id", "p.country_of_residence_id")
    .where("p.user_id", userId)
    .first(["p.*", "nat.name as nationality_name", "res.name as residence_name"]);
  if (!profile) throw new NotFoundError("Profile not found");

  // Last thing before the network, so every 503 costs the caller nothing.
  assertConfigured();
  return parseMatchScore(
    await generateText({
      system: MATCH_SYSTEM,
      prompt: buildMatchPrompt(job, profile),
      temperature: 0.3,
    }),
  );
}
