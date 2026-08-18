// Zod at the boundary. Nothing in this module trusts the request body for anything
// the JWT or the database can answer instead — the student id, the wallet, and the
// document's owning session all come from those, never from here.

import { z } from "zod";
import { EXPORT_FORMATS } from "../consts.js";

const IdParam = z.coerce.number().int().positive();

export const SessionIdParamSchema = z.object({ id: IdParam });
export const DocumentIdParamSchema = z.object({ id: IdParam });

/**
 * ISO-3166 alpha-2, which is what sop_config and sop_country_guides are keyed on.
 * Upper-cased so a lower-case query still resolves.
 */
const CountryCode = z
  .string()
  .trim()
  .length(2)
  .transform((v) => v.toUpperCase());

export const ConfigQuerySchema = z.object({ country_code: CountryCode });

/**
 * No URL fields on this module's surface. If one is ever added it must use
 * `webUrl()` from shared/url.ts — `z.string().url()` accepts `javascript:` and
 * `data:text/html`, which is a stored-XSS bug once a draft is rendered.
 */
export const CreateSessionSchema = z.object({
  country_id: z.coerce.number().int().positive().nullish(),
  target_org_type: z.enum(["business", "institution"]).nullish(),
  target_org_id: z.coerce.number().int().positive().nullish(),
  /** A uuid inside the target org's own tenant schema. See the migration header. */
  course_service_id: z.string().uuid().nullish(),
  profile_snapshot: z.record(z.string(), z.unknown()).default({}),
});

export const UpsertAnswersSchema = z.object({
  answers: z
    .array(
      z.object({
        question_key: z.string().trim().min(1).max(120),
        answer: z.string().max(20_000).nullish(),
        answer_json: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(50),
});

/** The student's own edit of a draft. Bounded so one revision cannot be a novel. */
export const SaveVersionSchema = z.object({
  content: z.string().trim().min(1).max(60_000),
});

export const RestoreVersionSchema = z.object({
  version: z.coerce.number().int().positive(),
});

export const ExportQuerySchema = z.object({
  format: z.enum(EXPORT_FORMATS),
});
