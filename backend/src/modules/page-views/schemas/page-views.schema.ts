import { z } from "zod";
import { PAGE_VIEW_TYPES } from "../consts.js";

export const PageViewParamSchema = z.object({
  entityType: z.enum(PAGE_VIEW_TYPES),
  // Ids don't share a domain across types (integer business id, integer listing id, room for a slug
  // later), so the shape is only bounded — the row it counts is never looked up.
  entityId: z.string().min(1).max(64),
});
