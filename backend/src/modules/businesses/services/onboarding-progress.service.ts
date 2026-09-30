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
  /**
   * Play the welcome splash on the portal? NOT a checklist step — there is nothing to tick off.
   *
   * Set only when an onboarding invitation is accepted, cleared when the splash is dismissed, and
   * false by default — so an org that predates this, or has no row at all, is never shown one.
   *
   * It rides along here because the portal already fetches this on mount, and one boolean does not
   * deserve its own round trip.
   */
  showWelcome: boolean;
}

function buildSteps(input: {
  showExtractionStep: boolean;
  extractionHasData: boolean;
  /** Any course to review — extracted, hand-added or shared from a head office. A visit to an
   *  empty Services tab must not tick "Review courses". */
  hasCourses: boolean;
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
      done: !!input.reviewedCoursesAt && input.hasCourses,
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

function summarize(steps: OnboardingStep[], row: repo.OnboardingProgressRow | undefined): OnboardingProgress {
  return {
    steps,
    completed: steps.filter((s) => s.done).length,
    total: steps.length,
    showWelcome: !!row?.welcome_pending,
  };
}

/**
 * `installed` needs a real visitor, not just an active config — an owner can flip a config active
 * without ever pasting the embed snippet on their site.
 *
 * `customised` needs a name or greeting, not merely a row: the portal's AI-embed card mints a
 * default widget for every org the first time it loads, so existence alone would tick "Customise
 * your AI assistant" for people who have never opened it.
 */
async function aiWidgetState(
  db: Knex, column: "business_id" | "institution_id", id: number,
): Promise<{ customised: boolean; installed: boolean }> {
  const row = await masterKnex("ai_embed_configs").where({ [column]: id })
    .orderBy("created_at", "asc").first("id", "display_name", "greeting");
  if (!row) return { customised: false, installed: false };
  const visitor = await db("ai_widget_visitors").where({ embed_config_id: row.id }).first("id");
  return { customised: !!(row.display_name || row.greeting), installed: !!visitor };
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
    // ponytail: a plain business's own services aren't counted — only the institution path gates.
    hasCourses: true,
    reviewedCoursesAt: progress?.reviewed_courses_at ?? null,
    hasAiWidget: widget.customised,
    widgetInstalled: widget.installed,
    teamInvited: memberCount > 1 || pendingInvites > 0,
  }), progress);
}

export async function getInstitutionOnboardingProgress(
  institutionId: number,
  sourceJobId: string | null,
  schemaName: string,
  hasOwnCourses = false,
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
    hasCourses: hasData || hasOwnCourses,
    reviewedCoursesAt: progress?.reviewed_courses_at ?? null,
    hasAiWidget: widget.customised,
    widgetInstalled: widget.installed,
    teamInvited: Number(count) > 1 || pendingInvites > 0,
  }), progress);
}

export const markWelcomePendingForBusiness = repo.markWelcomePendingForBusiness;
export const markWelcomePendingForInstitution = repo.markWelcomePendingForInstitution;
export const clearWelcomePendingForBusiness = repo.clearWelcomePendingForBusiness;
export const clearWelcomePendingForInstitution = repo.clearWelcomePendingForInstitution;
export const markCoursesReviewedForBusiness = repo.markCoursesReviewedForBusiness;
export const markCoursesReviewedForInstitution = repo.markCoursesReviewedForInstitution;
