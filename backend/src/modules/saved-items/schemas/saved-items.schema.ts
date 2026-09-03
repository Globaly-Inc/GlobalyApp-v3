import { z } from "zod";
import { SAVED_ITEM_TYPES } from "../consts.js";

export const SavedItemParamSchema = z.object({
  itemType: z.enum(SAVED_ITEM_TYPES),
  // Validated per type in the service — a course id is a UUID, an institution a padded fragment.
  itemId: z.string().min(1).max(64),
});

/** `expand` swaps the id list for the full rows the Saved tab renders. */
export const SavedItemsQuerySchema = z.object({
  type: z.enum(SAVED_ITEM_TYPES).optional(),
  expand: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
});
