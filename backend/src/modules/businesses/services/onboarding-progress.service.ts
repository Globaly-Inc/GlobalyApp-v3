import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { getSelfServiceStatus } from "../../superadmin/data-extraction/services/jobs.service.js";
import { isInstitutionCategory } from "../../superadmin/data-extraction/repositories/promote.repository.js";
import { countAgents, countPendingInvitations as countPendingAgentInvitations } from "../../agents/repositories/agents.repository.js";
import { countPendingInvitations as countPendingMemberInvitations } from "../../platform-users/repositories/institution-invitations.repository.js";
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
  showExtractionStep: boolean;
  extractionHasData: boolean;
  reviewedCoursesAt: string | null;
  hasAiWidget: boolean;
  widgetInstalled: boolean;
  teamInvited: boolean;
}): OnboardingStep[] {
  const steps: OnboardingStep[] = [
    { key: "create_account", label: "Create your account", detail: "", duration: null, done: true },
    { key: "verify_email", label: "Verify your work email", detail: "", duration: null, done: true },
  ];
  if (input.showExtractionStep) {
    steps.push({
      key: "extract_website", label: "Extract your website data",
      detail: "Build your profile from your website", duration: "~15 min",
      done: input.extractionHasData,
    });
  }
  steps.push(
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
      done: input.widgetInstalled,
    },
    {
      key: "invite_team", label: "Invite your team",
      detail: "Admissions staff who answer enquiries", duration: "~2 min",
      done: input.teamInvited,
    },
  );
  return steps;
}

function summarize(steps: OnboardingStep[]): OnboardingProgress {
  return { steps, completed: steps.filter((s) => s.done).length, total: steps.length };
}

/** `installed` needs a real visitor, not just an active config — an owner can flip a config
 *  active without ever pasting the embed snippet on their site. */
async function aiWidgetState(
  db: Knex, column: "business_id" | "institution_id", id: number,
): Promise<{ exists: boolean; installed: boolean }> {
  const row = await masterKnex("ai_embed_configs").where({ [column]: id }).first("id");
  if (!row) return { exists: false, installed: false };
  const visitor = await db("ai_widget_visitors").where({ embed_config_id: row.id }).first("id");
  return { exists: true, installed: !!visitor };
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
  businessCategoryId: number | null,
): Promise<OnboardingProgress> {
  const db = await getKnex(businessId, schemaName);
  const [progress, hasData, widget, memberCount, pendingInvites, showExtractionStep] = await Promise.all([
    repo.findByBusinessId(businessId),
    extractionHasData(sourceJobId),
    aiWidgetState(db, "business_id", businessId),
    countAgents(db),
    countPendingAgentInvitations(db),
    businessCategoryId ? isInstitutionCategory(businessCategoryId) : Promise.resolve(false),
  ]);
  return summarize(buildSteps({
    showExtractionStep,
    extractionHasData: hasData,
    reviewedCoursesAt: progress?.reviewed_courses_at ?? null,
    hasAiWidget: widget.exists,
    widgetInstalled: widget.installed,
    teamInvited: memberCount > 1 || pendingInvites > 0,
  }));
}

export async function getInstitutionOnboardingProgress(
  institutionId: number,
  sourceJobId: string | null,
  schemaName: string,
): Promise<OnboardingProgress> {
  const db = await getKnex(institutionId, schemaName);
  const [progress, hasData, widget, [{ count }], pendingInvites] = await Promise.all([
    repo.findByInstitutionId(institutionId),
    extractionHasData(sourceJobId),
    aiWidgetState(db, "institution_id", institutionId),
    db("members").whereNull("deleted_at").where({ is_contact_only: false }).count("id as count"),
    countPendingMemberInvitations(db),
  ]);
  return summarize(buildSteps({
    showExtractionStep: true,
    extractionHasData: hasData,
    reviewedCoursesAt: progress?.reviewed_courses_at ?? null,
    hasAiWidget: widget.exists,
    widgetInstalled: widget.installed,
    teamInvited: Number(count) > 1 || pendingInvites > 0,
  }));
}

export const markCoursesReviewedForBusiness = repo.markCoursesReviewedForBusiness;
export const markCoursesReviewedForInstitution = repo.markCoursesReviewedForInstitution;
