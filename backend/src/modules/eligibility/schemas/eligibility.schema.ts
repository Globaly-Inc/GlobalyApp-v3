import { z } from "zod";

import { PaginationSchema } from "../../../shared/pagination.js";

// The only untrusted input this module takes is one service uuid. The owner is
// always req.auth.sub, so no schema here accepts a user id — a body that carries
// one is a 400, not a silently ignored field, hence .strict().

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RunCheckSchema = z
  .object({
    // V1's request body was `{ courseId }`. V3 calls a course a service and the id
    // is the tenant uuid `catalog_services` is keyed on. Bounded before the shape
    // check so a megabyte string never reaches the regex.
    service_id: z.string().min(1).max(64).regex(UUID, "service_id must be a uuid"),
  })
  .strict();

export type RunCheckInput = z.infer<typeof RunCheckSchema>;

export const ListChecksQuerySchema = PaginationSchema;
