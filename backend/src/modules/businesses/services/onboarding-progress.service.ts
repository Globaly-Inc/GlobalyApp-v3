import { masterKnex } from "../../../core/db/master-pool.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { getSelfServiceStatus } from "../../superadmin/data-extraction/services/jobs.service.js";
import { countAgents } from "../../agents/repositories/agents.repository.js";
import * as repo from "../repositories/onboarding-progress.repository.js";

export interface OnboardingStep {
  key: string;
  label: string;
  detail: string;
  duration: string | null;
  done: boolean;
}

export interface OnboardingProgress {
  steps: OnboardingStep[];
  completed: number;
  total: number;
}

function buildSteps(input: {
  extractionHasData: boolean;
  reviewedCoursesAt: string | null;
  hasAiWidget: boolean;
  aiWidgetActive: boolean;
  teamMemberCount: number;
}): OnboardingStep[] {
  return [
    { key: "create_account", label: "Create your account", detail: "", duration: null, done: true },
    { key: "verify_email", label: "Verify your work email", detail: "", duration: null, done: true },
    {
      key: "extract_website", label: "Extract your website data",
      detail: "Build your profile from your website", duration: "~15 min",
      done: input.extractionHasData,
    },
    {
      key: "review_courses", label: "Review courses & services",
      detail: "Check what we found, fix gaps", duration: "~10 min",
      done: !!input.reviewedCoursesAt,
    },
    {
      key: "customize_assistant", label: "Customise your AI assistant",
      detail: "Name, greeting and tone of voice", duration: "~5 min",
      done: input.hasAiWidget,
    },
    {
      key: "add_chat_widget", label: "Add the chat widget to your site",
      detail: "Paste one line of code, or send it to IT", duration: "~5 min",
      done: input.aiWidgetActive,
    },
    {
      key: "invite_team", label: "Invite your team",
      detail: "Admissions staff who answer enquiries", duration: "~2 min",
      done: input.teamMemberCount > 1,
    },
  ];
}

function summarize(steps: OnboardingStep[]): OnboardingProgress {
  return { steps, completed: steps.filter((s) => s.done).length, total: steps.length };
}

async function aiWidgetState(column: "business_id" | "institution_id", id: number): Promise<{ exists: boolean; active: boolean }> {
  const row = await masterKnex("ai_embed_configs").where({ [column]: id }).first("is_active");
  return { exists: !!row, active: !!row?.is_active };
}

async function extractionHasData(sourceJobId: string | null): Promise<boolean> {
  if (!sourceJobId) return false;
  const status = await getSelfServiceStatus(sourceJobId);
  return (status?.counts.courses ?? 0) > 0;
}

export async function getBusinessOnboardingProgress(
  businessId: number,
  sourceJobId: string | null,
  schemaName: string,
): Promise<OnboardingProgress> {
  const db = await getKnex(businessId, schemaName);
  const [progress, hasData, widget, memberCount] = await Promise.all([
    repo.findByBusinessId(businessId),
    extractionHasData(sourceJobId),
    aiWidgetState("business_id", businessId),
    countAgents(db),
  ]);
  return summarize(buildSteps({
    extractionHasData: hasData,
    reviewedCoursesAt: progress?.reviewed_courses_at ?? null,
    hasAiWidget: widget.exists,
    aiWidgetActive: widget.active,
    teamMemberCount: memberCount,
  }));
}

export async function getInstitutionOnboardingProgress(
  institutionId: number,
  sourceJobId: string | null,
  schemaName: string,
): Promise<OnboardingProgress> {
  const db = await getKnex(institutionId, schemaName);
  const [progress, hasData, widget, [{ count }]] = await Promise.all([
    repo.findByInstitutionId(institutionId),
    extractionHasData(sourceJobId),
    aiWidgetState("institution_id", institutionId),
    db("members").whereNull("deleted_at").where({ is_contact_only: false }).count("id as count"),
  ]);
  return summarize(buildSteps({
    extractionHasData: hasData,
    reviewedCoursesAt: progress?.reviewed_courses_at ?? null,
    hasAiWidget: widget.exists,
    aiWidgetActive: widget.active,
    teamMemberCount: Number(count),
  }));
}

export const markCoursesReviewedForBusiness = repo.markCoursesReviewedForBusiness;
export const markCoursesReviewedForInstitution = repo.markCoursesReviewedForInstitution;
