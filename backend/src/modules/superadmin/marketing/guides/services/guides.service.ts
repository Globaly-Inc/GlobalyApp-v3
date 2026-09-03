import { BadRequestError, ConflictError, NotFoundError } from "../../../../../shared/errors.js";
import { createChildLogger } from "../../../../../shared/logger.js";
import { queueService } from "../../../../../shared/queue/queueService.js";
import * as guidesRepo from "../repositories/guides.repository.js";
import * as leadsRepo from "../repositories/leads.repository.js";
import type { GuideInput, PublicLeadInput } from "../schemas/guides.schema.js";

const logger = createChildLogger("guides-service");

// Signal queue for the email worker — the batch sweep (guide-email.worker.ts) is the source of
// truth, this just lets it run sooner than the next cron tick when LavinMQ is up.
export const GUIDE_EMAIL_QUEUE = "guide.email";

export const listGuides = guidesRepo.listGuides;
export const countGuides = guidesRepo.countGuides;
export const findGuideById = guidesRepo.findGuideById;

async function requireGuide(id: number) {
  const row = await guidesRepo.findGuideById(id);
  if (!row) throw new NotFoundError("Guide not found");
  return row;
}

// The form enforces one-or-the-other, but the backend is the actual boundary — never trust
// the client alone on a rule like this.
function assertSingleBackground(
  data: Partial<GuideInput>,
  existing?: { background_image_url?: string | null; background_video_url?: string | null },
) {
  const image = data.background_image_url !== undefined ? data.background_image_url : existing?.background_image_url;
  const video = data.background_video_url !== undefined ? data.background_video_url : existing?.background_video_url;
  if (image && video) throw new BadRequestError("Use a background image or a background video, not both");
}

export async function createGuide(data: GuideInput) {
  const clash = await guidesRepo.findGuideBySlug(data.slug);
  if (clash) throw new ConflictError("slug already exists");
  assertSingleBackground(data);
  return guidesRepo.insertGuide(data);
}

export async function updateGuide(id: number, data: Partial<GuideInput>) {
  const existing = await requireGuide(id);
  if (data.slug && data.slug !== existing.slug) {
    const clash = await guidesRepo.findGuideBySlug(data.slug, id);
    if (clash) throw new ConflictError("slug already exists");
  }
  assertSingleBackground(data, existing);
  return guidesRepo.updateGuide(id, data);
}

export async function deleteGuide(id: number) {
  await requireGuide(id);
  await guidesRepo.deleteGuide(id);
}

// ─── Public surface ────────────────────────────────────────────────────────────────────────

/** Strips pdf_url (and the soft-delete marker) — the public page must never see the file path. */
function serializePublicGuide(row: Record<string, unknown>) {
  const { pdf_url: _pdf_url, deleted_at: _deleted_at, ...rest } = row;
  return rest;
}

export async function listPublishedGuides() {
  const rows = await guidesRepo.listPublishedGuides();
  return rows.map(serializePublicGuide);
}

export async function getPublicGuideBySlug(slug: string) {
  const row = await guidesRepo.findPublishedGuideBySlug(slug);
  return row ? serializePublicGuide(row) : null;
}

export async function submitLead(slug: string, input: PublicLeadInput) {
  // Honeypot: a real visitor never sees or fills this field. A bot that fills every field
  // gets a convincing success response with no write, so it has no signal to adapt to.
  if (input.website) return { ok: true };

  const guide = await guidesRepo.findPublishedGuideBySlug(slug);
  if (!guide) throw new NotFoundError("Guide not found");

  const lead = await leadsRepo.upsertLead(guide.id, input.name, input.email);

  try {
    await queueService.publish(GUIDE_EMAIL_QUEUE, { leadId: lead.id });
  } catch (err) {
    logger.error("Failed to publish guide.email job — the sweep worker will still pick it up", {
      leadId: lead.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { ok: true };
}
