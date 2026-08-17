// Business logic for the curated-content tabs. Every write is audited.

import { NotFoundError } from "../../../../shared/errors.js";
import { logAudit } from "../../data-extraction/shared/audit.js";
import * as repo from "../repositories/content.repository.js";
import type { ContentKind } from "../repositories/content.repository.js";
import type { ListQuery } from "../schemas/content.schema.js";

// The audit action verb per table, so the log reads AI_KNOWLEDGE_VISA_CREATE etc.
const AUDIT_ENTITY: Record<ContentKind, string> = {
  visa: "ai_knowledge_visa",
  faqs: "ai_knowledge_faqs",
  guides: "ai_knowledge_country_guides",
};

export async function listContent(kind: ContentKind, query: ListQuery) {
  return { [kind]: await repo.list(kind, query) };
}

export async function createContent(kind: ContentKind, data: Record<string, unknown>, adminId: number) {
  // FAQs record their author; the other two record who last verified them.
  const row = await repo.insert(kind, kind === "faqs" ? { ...data, created_by: adminId } : data);
  await logAudit(adminId, `AI_KNOWLEDGE_${kind.toUpperCase()}_CREATE`, {
    entityType: AUDIT_ENTITY[kind],
    entityId: row.id,
  });
  return { [kind === "guides" ? "guide" : kind === "faqs" ? "faq" : "visa"]: row };
}

export async function updateContent(
  kind: ContentKind,
  id: string,
  patch: Record<string, unknown>,
  adminId: number,
) {
  const existing = await repo.findById(kind, id);
  if (!existing) throw new NotFoundError(`${kind} entry not found`);

  const row = await repo.update(kind, id, patch);
  await logAudit(adminId, `AI_KNOWLEDGE_${kind.toUpperCase()}_UPDATE`, {
    entityType: AUDIT_ENTITY[kind],
    entityId: id,
    details: { fields: Object.keys(patch) },
  });
  return { [kind === "guides" ? "guide" : kind === "faqs" ? "faq" : "visa"]: row };
}

export async function deleteContent(kind: ContentKind, id: string, adminId: number) {
  const deleted = await repo.remove(kind, id);
  if (!deleted) throw new NotFoundError(`${kind} entry not found`);
  await logAudit(adminId, `AI_KNOWLEDGE_${kind.toUpperCase()}_DELETE`, {
    entityType: AUDIT_ENTITY[kind],
    entityId: id,
  });
  return { deleted: true };
}

// ── Verification queue ──

export async function listQueue(opts: { status?: string; limit: number }) {
  return { queue: await repo.listQueue(opts) };
}

export async function reviewQueueItem(
  id: string,
  status: "verified" | "rejected",
  adminId: number,
  rejectionReason: string | null = null,
) {
  const row = await repo.reviewQueueItem(id, status, adminId, rejectionReason);
  if (!row) throw new NotFoundError("Queue item not found");
  await logAudit(adminId, `AI_KNOWLEDGE_QUEUE_${status.toUpperCase()}`, {
    entityType: "data_verification_queue",
    entityId: id,
    details: rejectionReason ? { rejection_reason: rejectionReason } : {},
  });
  return { item: row };
}

export async function overview() {
  return { counts: await repo.overviewCounts() };
}
