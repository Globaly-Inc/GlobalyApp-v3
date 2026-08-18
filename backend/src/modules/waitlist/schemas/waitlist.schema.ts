import { z } from "zod";

import { PaginationSchema } from "../../../shared/pagination.js";
import { REGISTRANT_TYPES } from "../consts.js";

// The sign-up body is the only fully UNTRUSTED input in this module — the route is
// public, so anything on the internet can post it. Everything is bounded and
// .strict(): an unknown key is a 400, not a silently dropped field.

export const RegisterWaitlistSchema = z
  .object({
    // 320 is the RFC-bounded maximum address length. Trimmed, then lower-cased in
    // the service — the table's CHECK enforces the folding independently.
    email: z.string().trim().toLowerCase().min(3).max(320).email(),
    name: z.string().trim().min(1).max(120),
    type: z.enum(REGISTRANT_TYPES),
  })
  .strict();

export type RegisterWaitlistInput = z.infer<typeof RegisterWaitlistSchema>;

export const ListWaitlistQuerySchema = PaginationSchema;
