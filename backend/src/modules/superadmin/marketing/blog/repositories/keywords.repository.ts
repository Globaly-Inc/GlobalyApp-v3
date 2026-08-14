import { masterKnex } from "../../../../../core/db/master-pool.js";

const now = () => masterKnex.fn.now();
const TABLE = "superadmin.blog_keywords";

export async function listKeywords(isActive?: boolean) {
  const q = masterKnex(TABLE).orderBy("created_at", "desc");
  if (isActive !== undefined) q.where({ is_active: isActive });
  return q;
}

export async function findKeywordById(id: number) {
  return masterKnex(TABLE).where({ id }).first();
}

export async function insertKeyword(data: Record<string, unknown>) {
  const [row] = await masterKnex(TABLE).insert(data).returning("*");
  return row;
}

export async function updateKeyword(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex(TABLE).where({ id }).update({ ...data, updated_at: now() }).returning("*");
  return row;
}

export async function deleteKeyword(id: number) {
  return masterKnex(TABLE).where({ id }).delete();
}
