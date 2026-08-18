// Representations service — CRUD + directory resync on create/deactivate.
// Directory resync runs inline (synchronous call, same request) — this isn't
// a bulk operation, so no queue/worker is warranted yet.

import * as repo from "../repositories/representations.repository.js";
import { PG_UNIQUE_VIOLATION } from "../repositories/representations.repository.js";
import * as matchDirectorySync from "./match-directory-sync.service.js";
import { logEnquiryAudit } from "../shared/audit.js";

export class DuplicateRepresentationError extends Error {
  constructor(message = "This business already represents this institution/course") {
    super(message);
    this.name = "DuplicateRepresentationError";
  }
}

export class RepresentationNotFoundError extends Error {
  constructor(message = "Representation not found") {
    super(message);
    this.name = "RepresentationNotFoundError";
  }
}

export async function createRepresentation(
  opts: {
    businessId: number;
    extractionJobId: string | null;
    extractionCourseId: string | null;
  },
  performedBy?: number | null,
) {
  let representation;
  try {
    representation = await repo.create(opts);
  } catch (err: any) {
    if (err?.code === PG_UNIQUE_VIOLATION) {
      throw new DuplicateRepresentationError();
    }
    throw err;
  }

  await matchDirectorySync.syncForBusiness(opts.businessId);

  // Not run inside repo.create()'s (nonexistent) transaction — representation
  // creation is a single insert, not a multi-step transaction, so this is a
  // best-effort post-write audit row rather than an atomic one, consistent
  // with how the directory resync above is already handled the same way.
  await logEnquiryAudit(performedBy ?? null, "representation.created", {
    entityType: "representation",
    entityId: representation.id,
    details: { business_id: opts.businessId, extraction_job_id: opts.extractionJobId, extraction_course_id: opts.extractionCourseId },
  });

  return representation;
}

export async function listRepresentations(businessId: number) {
  return repo.listByBusiness(businessId);
}

export async function deactivateRepresentation(id: string, performedBy?: number | null) {
  const existing = await repo.findById(id);
  if (!existing) {
    throw new RepresentationNotFoundError();
  }

  const updated = await repo.deactivate(id);
  await matchDirectorySync.syncForBusiness(existing.business_id);

  await logEnquiryAudit(performedBy ?? null, "representation.suspended", {
    entityType: "representation",
    entityId: id,
    details: { business_id: existing.business_id, old_status: existing.status, new_status: "inactive" },
  });

  return updated;
}
