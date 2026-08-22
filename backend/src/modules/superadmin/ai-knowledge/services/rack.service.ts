// Knowledge Rack logic: category/source CRUD, document reads, and crawl dispatch.

import { BadRequestError, ConflictError, NotFoundError } from "../../../../shared/errors.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import * as storage from "../../../../shared/storage/storageService.js";
import { logAudit } from "../../data-extraction/shared/audit.js";
import { createDocumentExtractor } from "../../data-extraction/lib/document-extractor.js";
import { KNOWLEDGE_QUEUES } from "../shared/queues.js";
import { hashOf, ingestDocumentChunks, wordsIn } from "../lib/ingest.js";
import * as repo from "../repositories/rack.repository.js";
import { RACK_UPLOAD_MIME_BY_EXT } from "../schemas/rack.schema.js";
import type {
  CreateSourceInput, DocumentQuery, SourceQuery, UploadSourceInput,
} from "../schemas/rack.schema.js";

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
  const source = await repo.findSource(id);
  const deleted = await repo.deleteSource(id);
  if (!deleted) throw new NotFoundError("Source not found");
  // Documents and chunks cascade in the DB; the uploaded object does not.
  if (source?.file_path) {
    await storage.deleteFile(source.file_path).catch((e: Error) =>
      logger.warn("Uploaded file left behind in storage", { id, error: e.message }),
    );
  }
  await logAudit(adminId, "AI_KNOWLEDGE_SOURCE_DELETE", {
    entityType: "ai_knowledge_sources",
    entityId: id,
  });
  return { deleted: true };
}

// ── Upload ──

/** Rack uploads are stored text, not prompt input — allow far more than the 40k default. */
const UPLOAD_MAX_CHARS = 400_000;

const extensionOf = (name: string) => name.toLowerCase().split(".").pop() ?? "";

/** First markdown heading, else the filename without its extension. */
function titleForUpload(markdown: string, fileName: string): string {
  const heading = /^#{1,6} +(\S.*)$/m.exec(markdown)?.[1]?.trim();
  return (heading || fileName.replace(/\.[^.]+$/, "")).slice(0, 300);
}

/**
 * Upload a document straight into the rack: store the file, extract its text,
 * chunk and embed it. Runs inline rather than on a queue — one file, superadmin
 * only, and the admin gets the chunk count back in the response.
 *
 * ponytail: inline extraction+embedding. A 130KB markdown doc is ~60 chunks and
 * ~12s of embedding at EMBED_CONCURRENCY=5. Move to the crawl queue if uploads
 * ever start timing out (a book-sized PDF would).
 */
export async function uploadSource(
  input: UploadSourceInput,
  file: { name: string; buffer: Buffer },
  adminId: number,
) {
  const category = await repo.findCategory(input.category_id);
  if (!category) throw new NotFoundError("Category not found");

  const mimeType = RACK_UPLOAD_MIME_BY_EXT[extensionOf(file.name)];
  if (!mimeType) {
    throw new BadRequestError(`Unsupported file type — upload one of: ${Object.keys(RACK_UPLOAD_MIME_BY_EXT).join(", ")}`);
  }
  storage.validateFile(mimeType, file.buffer.length, new Set(Object.values(RACK_UPLOAD_MIME_BY_EXT)));

  // Mirrors the "ai-chat/<user>/attachments" convention already in the repo.
  const filePath = storage.buildPath("ai-knowledge", "uploads", input.category_id, file.name);
  await storage.uploadFile(filePath, file.buffer, mimeType);

  let source;
  try {
    source = await repo.insertSource({
      category_id: input.category_id,
      source_type: "file",
      url: null,
      // NOT NULL on the table and used as the trust badge key — uploads have no host.
      domain: "upload",
      file_path: filePath,
      file_name: file.name,
      mime_type: mimeType,
      title: input.title ?? null,
      trust_tier: input.trust_tier,
      country_code: input.country_code ?? null,
      // There is no page to re-fetch; replacing the content means a new upload.
      crawl_frequency: "off",
      added_by: adminId,
      added_via: "manual",
      active: true,
    });
  } catch (e) {
    await storage.deleteFile(filePath).catch(() => {});
    if ((e as { code?: string }).code === "23505") {
      throw new ConflictError("That file is already a source in this category");
    }
    throw e;
  }

  // Anything below this point leaves a half-ingested source behind, so failures
  // roll the whole upload back rather than parking a row the admin must clean up.
  const rollback = async () => {
    await repo.deleteSource(source.id).catch(() => {});
    await storage.deleteFile(filePath).catch(() => {});
  };

  let markdown: string;
  try {
    if (mimeType === "application/pdf") {
      const extracted = await createDocumentExtractor().extract({
        file_url: filePath,
        file_name: file.name,
        max_chars: UPLOAD_MAX_CHARS,
      });
      if (extracted.error || !extracted.text.trim()) {
        throw new BadRequestError(`Could not read that PDF (${extracted.error ?? "empty"})`);
      }
      markdown = extracted.text;
    } else {
      // Markdown and plain text need no parser — reading the buffer avoids the
      // extractor's return cap entirely.
      markdown = file.buffer.toString("utf-8");
    }
    if (!markdown.trim()) throw new BadRequestError("That file has no readable text");
  } catch (e) {
    await rollback();
    throw e;
  }

  try {
    const title = input.title?.trim() || titleForUpload(markdown, file.name);
    const document = await repo.insertDocument({
      source_id: source.id,
      category_id: input.category_id,
      // Documents require a locator and are UNIQUE per (source, url) — the object
      // path is the upload's locator. file_name carries the human-readable citation.
      url: filePath,
      title,
      markdown,
      content_hash: hashOf(markdown),
      word_count: wordsIn(markdown),
      active: true,
    });

    const ingested = await ingestDocumentChunks(document.id, markdown, { title });
    await repo.syncDocCount(source.id);
    const updated = await repo.updateSource(source.id, {
      last_status: ingested.chunks > 0 ? "ok" : "no_content",
      last_error: null,
      last_crawled_at: new Date(),
    });

    await logAudit(adminId, "AI_KNOWLEDGE_SOURCE_UPLOAD", {
      entityType: "ai_knowledge_sources",
      entityId: source.id,
      details: { file_name: file.name, mime_type: mimeType, chunks: ingested.chunks },
    });
    logger.info("Uploaded rack document", {
      sourceId: source.id, documentId: document.id, ...ingested,
    });

    return { source: updated, document_id: document.id, ...ingested };
  } catch (e) {
    await rollback();
    throw e;
  }
}

// ── Documents ──

export async function listDocuments(query: DocumentQuery) {
  return { documents: await repo.listDocuments(query) };
}

export async function getDocument(id: string) {
  const document = await repo.findDocument(id);
  if (!document) throw new NotFoundError("Document not found");
  // Vectors live on the chunks now, so the document row is safe to return as-is.
  return { document: { ...document, is_embedded: document.chunk_count > 0 } };
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
  if (source.source_type === "file") {
    throw new BadRequestError("Uploaded files have nothing to crawl — delete and re-upload to replace the content");
  }

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
