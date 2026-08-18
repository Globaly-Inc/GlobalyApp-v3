// Revision history and export. No model call, so nothing here is metered.
//
// A revision is an INSERT, never an UPDATE. That is V1's rule and the right one: the
// student's edits are their record of how the statement evolved, and a restore that
// overwrote history would destroy the thing history is for. `is_current` moves; every
// prior version stays readable.
//
// Two V1 defects are closed here:
//  * V1 cleared and set `is_current` with no uniqueness backing it, so an interleaved
//    save could leave two rows both current (defect D-E5-1). Every mutation runs in one
//    transaction that takes `FOR UPDATE` on the version set first, and the partial
//    unique index `sop_documents_current_uq` is the backstop if it ever does not.
//  * V1's export accepted "pdf" and "docx" and then returned JSON with the raw content
//    for all three, leaving the browser to render — so the server's own contract said
//    it produced formats it had never produced. Here the server serves what it can
//    actually serve, and refuses the rest.

import { BadRequestError, ConflictError, NotFoundError } from "../../../shared/errors.js";
import { MAX_VERSIONS, type DocumentType, type ExportFormat } from "../consts.js";
import { analyse, editDepthPct, type SopLimits } from "../lib/analysis.js";
import * as repo from "../repositories/sop.repository.js";
import { masterKnex } from "../../../core/db/master-pool.js";

/**
 * Loaded by document id and scoped to the caller's own sessions, so another student's
 * document is indistinguishable from one that does not exist.
 */
async function requireOwnDocument(documentId: number, studentId: number) {
  const doc = await repo.findDocument(documentId, studentId);
  if (!doc) throw new NotFoundError("SOP document not found");
  return doc;
}

async function limitsFor(
  countryId: number | null,
  documentType: DocumentType,
): Promise<SopLimits> {
  const countryCode = countryId ? await repo.findCountryIso2(countryId) : undefined;
  const rows = countryCode ? await repo.listConfig(countryCode) : [];
  const match = rows.find((r) => r.document_type === documentType);
  return {
    min_words: match?.min_words ?? null,
    max_words: match?.max_words ?? null,
    max_chars: match?.max_chars ?? null,
    banned_phrases: match?.banned_phrases ?? [],
  };
}

export async function listVersions(documentId: number, studentId: number) {
  const doc = await requireOwnDocument(documentId, studentId);
  return { data: await repo.listVersions(doc.session_id, doc.document_type) };
}

export async function getVersion(documentId: number, studentId: number) {
  return requireOwnDocument(documentId, studentId);
}

/** The student's own edit. `content` is theirs; everything else is derived. */
export async function saveVersion(documentId: number, studentId: number, content: string) {
  const doc = await requireOwnDocument(documentId, studentId);
  const limits = await limitsFor(doc.country_id, doc.document_type);
  return writeVersion(doc.session_id, doc.document_type, studentId, content, limits);
}

/**
 * Restore = a new version carrying the old text. V1 did the same, and its comment
 * ("Restoring does NOT overwrite history") is the one line of that function worth
 * keeping verbatim.
 */
export async function restoreVersion(
  documentId: number,
  studentId: number,
  version: number,
) {
  const doc = await requireOwnDocument(documentId, studentId);
  const versions = await repo.listVersions(doc.session_id, doc.document_type);
  const target = versions.find((v) => v.version === version);
  if (!target) throw new NotFoundError(`Version ${version} not found`);

  const full = await repo.findDocument(target.id, studentId);
  if (!full?.content) throw new NotFoundError(`Version ${version} not found`);

  const limits = await limitsFor(doc.country_id, doc.document_type);
  return writeVersion(doc.session_id, doc.document_type, studentId, full.content, limits, {
    restored_from: version,
  });
}

async function writeVersion(
  sessionId: number,
  documentType: DocumentType,
  studentId: number,
  content: string,
  limits: SopLimits,
  extra: Record<string, unknown> = {},
) {
  return masterKnex.transaction(async (trx) => {
    // FOR UPDATE on the whole version set: the next version number, the pruning
    // decision and the current-flag move all read it, and all three must see the same
    // set or two concurrent saves produce the same version number.
    const versions = await repo.listVersionsWithContent(sessionId, documentType, trx);
    if (versions.length === 0) {
      throw new ConflictError("Generate a draft before saving a revision");
    }

    const baseline = versions.find((v) => v.version === 1)?.content ?? versions[0].content ?? "";
    const nextVersion = Math.max(...versions.map((v) => v.version)) + 1;

    // V1's cap: ten rows, and version 1 is never the one pruned — it is the baseline
    // every later edit-depth figure is measured against.
    if (versions.length >= MAX_VERSIONS) {
      const prunable = versions.filter((v) => v.version > 1).slice(0, versions.length - MAX_VERSIONS + 1);
      await repo.deleteVersions(
        prunable.map((v) => v.id),
        trx,
      );
    }

    await repo.clearCurrentFlag(sessionId, documentType, trx);

    const analysis = analyse(content, limits);
    return repo.insertDocument(
      {
        session_id: sessionId,
        created_by: studentId,
        document_type: documentType,
        version: nextVersion,
        content,
        word_count: analysis.word_count,
        char_count: analysis.char_count,
        quality_score: analysis.quality_score,
        quality_breakdown: analysis.quality_breakdown,
        edit_depth_pct: editDepthPct(baseline, content),
        analysis: { ...analysis, ...extra } as unknown as Record<string, unknown>,
      },
      trx,
    );
  });
}

// ── export ──────────────────────────────────────────────────────────────────

export interface ExportResult {
  contentType: string;
  filename: string;
  body: string;
}

const TITLES: Record<DocumentType, string> = {
  university_sop: "University Sop",
  visa_sop: "Visa Sop",
  ucas_statement: "Ucas Statement",
};

export async function exportDocument(
  documentId: number,
  studentId: number,
  format: ExportFormat,
): Promise<ExportResult> {
  const doc = await requireOwnDocument(documentId, studentId);
  if (!doc.content) throw new BadRequestError("This version has no content to export");

  const countryCode = doc.country_id ? await repo.findCountryIso2(doc.country_id) : undefined;
  const stem = `statement-of-purpose-v${doc.version}`;

  // Logged against the session, as V1 did (`export_pdf` / `export_docx` / `export_text`),
  // so "who took a copy of this, and when" is answerable.
  await repo.insertLog({
    session_id: doc.session_id,
    student_id: studentId,
    initiated_by: studentId,
    action: `export_${format}`,
    status: "success",
    metadata: { document_id: documentId, version: doc.version, format },
  });

  if (format === "markdown") {
    const meta = [
      `**Document type:** ${TITLES[doc.document_type]}`,
      ...(countryCode ? [`**Destination:** ${countryCode}`] : []),
      `**Version:** ${doc.version}`,
      `**Words:** ${doc.word_count ?? "-"}`,
    ];
    const header = ["# Statement of Purpose", "", ...meta, "", "---", "", ""].join("\n");
    return {
      contentType: "text/markdown; charset=utf-8",
      filename: `${stem}.md`,
      body: `${header}${doc.content}\n`,
    };
  }

  return {
    contentType: "text/plain; charset=utf-8",
    filename: `${stem}.txt`,
    body: `${doc.content}\n`,
  };
}
