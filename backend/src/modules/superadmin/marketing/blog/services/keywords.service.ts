import { NotFoundError } from "../../../../../shared/errors.js";
import * as repo from "../repositories/keywords.repository.js";
import type { KeywordInput } from "../schemas/blog.schema.js";

export const listKeywords = repo.listKeywords;

export function createKeyword(data: KeywordInput) {
  return repo.insertKeyword(data);
}

export async function updateKeyword(id: number, data: Partial<KeywordInput>) {
  const row = await repo.updateKeyword(id, data);
  if (!row) throw new NotFoundError("Keyword not found");
  return row;
}

export async function deleteKeyword(id: number) {
  const existing = await repo.findKeywordById(id);
  if (!existing) throw new NotFoundError("Keyword not found");
  await repo.deleteKeyword(id);
}
