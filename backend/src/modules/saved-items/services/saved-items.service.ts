// Saved items service — validates the target is real and publicly visible before saving it, so a
// shortlist can never accumulate ids that no card will ever render.

import { NotFoundError } from "../../../shared/errors.js";
import * as repo from "../repositories/saved-items.repository.js";
import type { SavedItemType } from "../consts.js";

export function listSaved(userId: number, type?: SavedItemType) {
  return repo.listSavedItems(userId, type);
}

async function assertPublic(type: SavedItemType, itemId: string): Promise<void> {
  const exists = type === "course"
    ? await repo.coursePublicById(itemId)
    : await repo.institutionPublicByFragment(itemId);
  if (!exists) throw new NotFoundError(`${type === "course" ? "Course" : "Institution"} not found`);
}

export async function save(userId: number, type: SavedItemType, itemId: string): Promise<boolean> {
  await assertPublic(type, itemId);
  await repo.saveItem(userId, type, itemId);
  return true;
}

export async function unsave(userId: number, type: SavedItemType, itemId: string): Promise<boolean> {
  await repo.unsaveItem(userId, type, itemId);
  return false;
}

/** Save when unsaved, unsave when saved — returns the resulting state for the button. */
export async function toggle(userId: number, type: SavedItemType, itemId: string): Promise<boolean> {
  return (await repo.isSaved(userId, type, itemId))
    ? unsave(userId, type, itemId)
    : save(userId, type, itemId);
}
