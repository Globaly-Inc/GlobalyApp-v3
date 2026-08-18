// The scholarship moderation lifecycle (Wave G1).
//
// Neither V1 nor V2 has one — V1's AdminScholarships.tsx and V2's
// routes/scholarships.ts both expose exactly two verbs, toggle is_published and
// toggle is_featured. G1 adds submission → pending → approved | rejected, kept
// deliberately thin:
//
//   * A submission always lands `pending`, `is_published = false`, whoever made
//     it. Callers cannot set either field — create() overwrites both.
//   * approve(publish) may publish; reject always unpublishes.
//   * setPublished() refuses a rejected row. The table CHECK
//     (scholarships_rejected_not_published_check) is the real guarantee; this is
//     the readable 400 in front of it.
//
// is_published keeps its V2 meaning — the single predicate the public read filters
// on — so the read path never grows a second gate a future caller could forget.

import { BadRequestError, NotFoundError } from "../../../../../shared/errors.js";
import * as repo from "../repositories/scholarships.repository.js";

export type Owner = { type: "business" | "institution"; id: number };

async function assertExists(id: number) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError("Scholarship not found");
  return row;
}

/**
 * `owner` is set for a business submission and undefined for an admin one. Either
 * way the moderation columns are decided here, never by the caller.
 */
export async function submit(
  data: Record<string, unknown>,
  createdBy: number | null,
  owner?: Owner,
) {
  const { owner_org_type, owner_org_id, is_platform_scholarship, ...fields } = data;
  const org = owner
    ? { owner_org_type: owner.type, owner_org_id: owner.id }
    : {
        owner_org_type: (owner_org_type as string | null) ?? null,
        owner_org_id: owner_org_type ? ((owner_org_id as number | null) ?? null) : null,
      };

  return repo.insert({
    ...fields,
    ...org,
    // A business may not declare its own listing a platform scholarship.
    is_platform_scholarship: owner ? false : ((is_platform_scholarship as boolean | undefined) ?? false),
    created_by: createdBy,
    review_status: "pending",
    is_published: false,
    is_featured: false,
  });
}

export async function approve(id: number, publish: boolean, adminId: number | null) {
  await assertExists(id);
  return moderate(id, {
    review_status: "approved",
    review_note: null,
    is_published: publish,
    reviewed_by: adminId,
  });
}

export async function reject(id: number, note: string | undefined, adminId: number | null) {
  await assertExists(id);
  return moderate(id, {
    review_status: "rejected",
    review_note: note ?? null,
    // A rejected listing is never publicly readable. The table CHECK enforces it
    // too, so this cannot drift.
    is_published: false,
    reviewed_by: adminId,
  });
}

async function moderate(id: number, values: Record<string, unknown>) {
  const row = await repo.update(id, { ...values, reviewed_at: new Date() });
  if (!row) throw new NotFoundError("Scholarship not found");
  return row;
}

export async function setPublished(id: number, isPublished: boolean) {
  const existing = await assertExists(id);
  if (isPublished && existing.review_status === "rejected") {
    throw new BadRequestError("A rejected scholarship cannot be published — approve it first");
  }
  const row = await repo.update(id, { is_published: isPublished });
  if (!row) throw new NotFoundError("Scholarship not found");
  return row;
}

export async function setFeatured(id: number, isFeatured: boolean) {
  await assertExists(id);
  const row = await repo.update(id, { is_featured: isFeatured });
  if (!row) throw new NotFoundError("Scholarship not found");
  return row;
}

export async function stats() {
  return repo.stats();
}

/** A business may only ever touch its own listing. 404, not 403 — see below. */
export async function assertOwned(id: number, owner: Owner) {
  const row = await assertExists(id);
  if (row.owner_org_type !== owner.type || row.owner_org_id !== owner.id) {
    // Confirming it exists would leak another org's catalog.
    throw new NotFoundError("Scholarship not found");
  }
  return row;
}
