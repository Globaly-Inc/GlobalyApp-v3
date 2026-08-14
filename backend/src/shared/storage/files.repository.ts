// Repository for the uploaded_files metadata table.

import { masterKnex } from "../../core/db/master-pool.js";

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
