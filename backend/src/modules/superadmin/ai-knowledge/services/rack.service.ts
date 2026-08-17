// Knowledge Rack logic: category/source CRUD, document reads, and crawl dispatch.

import { BadRequestError, ConflictError, NotFoundError } from "../../../../shared/errors.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { logAudit } from "../../data-extraction/shared/audit.js";
import { KNOWLEDGE_QUEUES } from "../shared/queues.js";
import * as repo from "../repositories/rack.repository.js";
import type { CreateSourceInput, DocumentQuery, SourceQuery } from "../schemas/rack.schema.js";

const logger = createChildLogger("ai-knowledge-rack");

// ── Categories ──

export async function listCategories() {
  return { categories: await repo.listCategories() };
}

export async function createCategory(data: Record<string, unknown>, adminId: number) {
  const row = await repo.insertCategory(data).catch((e: { code?: string }) => {
    // slug is UNIQUE — surface the collision instead of a raw 500.
    if (e.code === "23505") throw new ConflictError("A category with that slug already exists");
    throw e;
  });
  await logAudit(adminId, "AI_KNOWLEDGE_CATEGORY_CREATE", {
    entityType: "ai_knowledge_categories",
    entityId: row.id,
  });
  return { category: row };
}

export async function updateCategory(id: string, patch: Record<string, unknown>, adminId: number) {
  const row = await repo.updateCategory(id, patch);
  if (!row) throw new NotFoundError("Category not found");
  await logAudit(adminId, "AI_KNOWLEDGE_CATEGORY_UPDATE", {
    entityType: "ai_knowledge_categories",
    entityId: id,
    details: { fields: Object.keys(patch) },
  });
  return { category: row };
}

// Sources and documents cascade, so this can remove a lot at once — say how much.
export async function deleteCategory(id: string, adminId: number) {
  const sources = await repo.listSources({ category_id: id, limit: 200 });
  const deleted = await repo.deleteCategory(id);
  if (!deleted) throw new NotFoundError("Category not found");
  await logAudit(adminId, "AI_KNOWLEDGE_CATEGORY_DELETE", {
    entityType: "ai_knowledge_categories",
    entityId: id,
    details: { cascaded_sources: sources.length },
  });
  return { deleted: true, cascaded_sources: sources.length };
}

// ── Sources ──

export async function listSources(query: SourceQuery) {
  return { sources: await repo.listSources(query) };
}

export async function createSource(input: CreateSourceInput, adminId: number) {
  const category = await repo.findCategory(input.category_id);
  if (!category) throw new NotFoundError("Category not found");

  // domain is derived, never client-supplied — it is what the trust badge keys off.
  const domain = new URL(input.url).hostname.replace(/^www\./, "");

  const row = await repo
    .insertSource({ ...input, domain, added_by: adminId })
    .catch((e: { code?: string }) => {
      if (e.code === "23505") throw new ConflictError("That URL is already a source in this category");
      throw e;
    });

  await logAudit(adminId, "AI_KNOWLEDGE_SOURCE_CREATE", {
    entityType: "ai_knowledge_sources",
    entityId: row.id,
    details: { url: input.url, domain },
  });
  return { source: row };
}

export async function updateSource(id: string, patch: Record<string, unknown>, adminId: number) {
  // Keep domain in step whenever the URL moves.
  if (typeof patch.url === "string") {
    patch.domain = new URL(patch.url).hostname.replace(/^www\./, "");
  }
  const row = await repo.updateSource(id, patch);
  if (!row) throw new NotFoundError("Source not found");
  await logAudit(adminId, "AI_KNOWLEDGE_SOURCE_UPDATE", {
    entityType: "ai_knowledge_sources",
    entityId: id,
    details: { fields: Object.keys(patch) },
  });
  return { source: row };
}

export async function deleteSource(id: string, adminId: number) {
  const deleted = await repo.deleteSource(id);
  if (!deleted) throw new NotFoundError("Source not found");
  await logAudit(adminId, "AI_KNOWLEDGE_SOURCE_DELETE", {
    entityType: "ai_knowledge_sources",
    entityId: id,
  });
  return { deleted: true };
}

// ── Documents ──

export async function listDocuments(query: DocumentQuery) {
  return { documents: await repo.listDocuments(query) };
}

export async function getDocument(id: string) {
  const document = await repo.findDocument(id);
  if (!document) throw new NotFoundError("Document not found");
  // The vector is megabytes of float and useless to the client.
  const { embedding, ...rest } = document;
  return { document: { ...rest, is_embedded: embedding != null } };
}

export async function deleteDocument(id: string, adminId: number) {
  const document = await repo.findDocument(id);
  if (!document) throw new NotFoundError("Document not found");
  await repo.deleteDocument(id);
  await repo.syncDocCount(document.source_id);
  await logAudit(adminId, "AI_KNOWLEDGE_DOCUMENT_DELETE", {
    entityType: "ai_knowledge_documents",
    entityId: id,
  });
  return { deleted: true };
}

// ── Crawl dispatch ──

export async function crawlSource(id: string, maxPages: number | undefined, adminId: number) {
  const source = await repo.findSource(id);
  if (!source) throw new NotFoundError("Source not found");
  if (!source.active) throw new BadRequestError("Source is inactive — reactivate it before crawling");

  await queueService.publish(KNOWLEDGE_QUEUES.CRAWL, {
    sourceId: id,
    maxPages: maxPages ?? source.max_pages ?? undefined,
  });
  await repo.updateSource(id, { last_status: "queued", last_error: null });

  await logAudit(adminId, "AI_KNOWLEDGE_SOURCE_CRAWL", {
    entityType: "ai_knowledge_sources",
    entityId: id,
    details: { max_pages: maxPages ?? source.max_pages ?? null },
  });
  logger.info("Queued rack crawl", { sourceId: id });
  return { dispatched: true };
}

export async function overview() {
  return { counts: await repo.rackCounts() };
}
