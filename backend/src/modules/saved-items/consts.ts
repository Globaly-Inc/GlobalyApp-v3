/** Kinds of thing a signed-in user can heart. Mirrors the saved_items_type_chk DB constraint. */
export const SAVED_ITEM_TYPES = ["course", "institution"] as const;

export type SavedItemType = (typeof SAVED_ITEM_TYPES)[number];
