import { z } from "zod";

import { PaginationSchema } from "../../../shared/pagination.js";
import { FAVOURITE_ITEM_TYPES, FAVOURITE_TARGETS } from "../consts.js";

// `student_favorites.item_type` has no CHECK constraint (20260817_820) and
// `item_id` is text, so THIS is the boundary that keeps junk out of storage.
//
// item_id is text because master targets have serial int PKs while a tenant
// service has a uuid PK. "Text" must not mean "anything": the shape is pinned per
// type from FAVOURITE_TARGETS, so a caller cannot store an id the resolver could
// never look up.

/** Serial int PK, spelled canonically — no leading zeros, no sign, no exponent. */
const INT_ID = /^[1-9][0-9]*$/;
const UUID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ItemTypeSchema = z.enum(FAVOURITE_ITEM_TYPES);

export const AddFavoriteSchema = z
  .object({
    item_type: ItemTypeSchema,
    // Bounded before the shape check so a megabyte string never reaches the regex.
    item_id: z.string().min(1).max(64),
  })
  // .strict() so a client cannot smuggle platform_user_id — the owner always comes
  // from the JWT — and a typo is a 400 rather than a silently ignored field.
  .strict()
  .superRefine((value, ctx) => {
    const shape = FAVOURITE_TARGETS[value.item_type].idShape;
    const pattern = shape === "uuid" ? UUID_ID : INT_ID;
    if (!pattern.test(value.item_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["item_id"],
        message: `item_id must be ${shape === "uuid" ? "a uuid" : "a positive integer"} for item_type "${value.item_type}"`,
      });
    }
  });

export type AddFavoriteInput = z.infer<typeof AddFavoriteSchema>;

export const ListFavoritesQuerySchema = PaginationSchema.extend({
  /** Optional tab filter. Counts in the response always cover every type. */
  item_type: ItemTypeSchema.optional(),
});

export const FavoriteIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
