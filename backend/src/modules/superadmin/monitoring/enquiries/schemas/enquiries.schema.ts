// Query schemas for the admin's read-only enquiry oversight screen.

import { z } from "zod";
import { PaginationSchema } from "../../../../../shared/pagination.js";
import { ENQUIRY_STATUSES } from "../../../../enquiries/schemas/distributions.schema.js";

/**
 * Comma-separated, because the screen filters by lifecycle bucket ("New", "Unlocked",
 * "Closed") rather than by one raw status — each bucket is several of them.
 */
const StatusList = z
  .string()
  .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
  .pipe(z.array(z.enum(ENQUIRY_STATUSES)).min(1));

export const EnquiryListQuery = PaginationSchema.extend({
  // Student name/email, course name, or institution name — the three things an admin
  // has to hand when someone asks "what happened to this enquiry".
  search: z.string().trim().max(200).optional(),
  status: StatusList.optional(),
});

export const EnquiryIdParam = z.object({ id: z.string().uuid() });
