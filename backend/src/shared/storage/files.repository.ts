// Repository for the uploaded_files metadata table.

import { masterKnex } from "../../core/db/master-pool.js";
import * as storage from "./storageService.js";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("files-repository");

export interface UploadedFileRow {
  id: number;
  uploaded_by: number;
  entity_type: string;
  entity_id: string;
  category: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: Date;
  updated_at: Date;
}

export async function insertFile(data: Omit<UploadedFileRow, "id" | "created_at" | "updated_at">) {
  const [row] = await masterKnex<UploadedFileRow>("uploaded_files").insert(data).returning("*");
  return row;
}

export async function findFileById(id: number) {
  return masterKnex<UploadedFileRow>("uploaded_files").where({ id }).whereNull("deleted_at").first();
}

export async function findFileByPath(storagePath: string) {
  return masterKnex<UploadedFileRow>("uploaded_files").where({ storage_path: storagePath }).whereNull("deleted_at").first();
}

export async function listFilesByEntity(entityType: string, entityId: string, category?: string) {
  const q = masterKnex<UploadedFileRow>("uploaded_files")
    .where({ entity_type: entityType, entity_id: entityId })
    .whereNull("deleted_at")
    .orderBy("created_at", "desc");
  if (category) q.where({ category });
  return q;
}

export async function deleteFileRecord(id: number) {
  return masterKnex("uploaded_files").where({ id }).update({ deleted_at: masterKnex.fn.now() });
}

/**
 * Deleting the parent entity (a service/course) removed neither its uploaded_files rows nor the
 * GCS objects they point to — every media upload became orphaned storage the instant its parent
 * was deleted. Called wherever a service/course delete happens, for every entity type that can
 * carry uploaded media (currently just "service" — courses and business services share that
 * entity_type, see service-media.routes.ts).
 */
export async function deleteFilesByEntity(entityType: string, entityId: string) {
  const files = await listFilesByEntity(entityType, entityId);
  if (files.length === 0) return;
  // Only rows whose storage object was actually removed are soft-deleted — deleted_at is what
  // listFilesByEntity filters on, so marking a row deleted on a FAILED storage delete would hide
  // the orphaned object from every listing with nothing left to ever retry cleaning it up.
  const results = await Promise.allSettled(files.map((f) => storage.deleteFile(f.storage_path)));
  const succeededIds: number[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") succeededIds.push(files[i].id);
    else logger.warn("Failed to delete storage object; leaving uploaded_files row for retry", {
      fileId: files[i].id, storagePath: files[i].storage_path, err: r.reason,
    });
  });
  if (succeededIds.length > 0) {
    await masterKnex("uploaded_files").whereIn("id", succeededIds).update({ deleted_at: masterKnex.fn.now() });
  }
}
