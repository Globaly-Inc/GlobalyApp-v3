import { z } from "zod";

// filter_config IS DATA. It is stored as jsonb, returned verbatim, and applied by
// the caller against its own typed query params. Nothing in this module ever
// interpolates one of its keys or values into a statement, which is why this schema
// makes no attempt to "sanitise" SQL-looking text — a filter value of
// `'; DROP TABLE x; --` is a legitimate free-text search term and is stored as
// written. Pretending to sanitise would hide the real defence.
//
// What the schema DOES do is bound the shape, which V2 did not (it typed the whole
// thing `z.any()`): one level of key → scalar-or-array-of-scalars, with caps on key
// count, key length, value length and array length. Without those a single POST can
// park megabytes of jsonb on a row, times fifty rows per user.

export const FILTER_CONFIG_LIMITS = {
  maxKeys: 40,
  maxKeyLength: 64,
  maxValueLength: 500,
  maxArrayLength: 100,
} as const;

/** A filter leaf: string, number, boolean or null. Deliberately not an object. */
const FilterScalarSchema = z.union([
  z.string().max(FILTER_CONFIG_LIMITS.maxValueLength),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const FilterValueSchema = z.union([
  FilterScalarSchema,
  z.array(FilterScalarSchema).max(FILTER_CONFIG_LIMITS.maxArrayLength),
]);

export const FilterConfigSchema = z
  .record(z.string().min(1).max(FILTER_CONFIG_LIMITS.maxKeyLength), FilterValueSchema)
  .refine((config) => Object.keys(config).length <= FILTER_CONFIG_LIMITS.maxKeys, {
    message: `filter_config may hold at most ${FILTER_CONFIG_LIMITS.maxKeys} keys`,
  });

export type FilterConfig = z.infer<typeof FilterConfigSchema>;

const ModuleKeySchema = z.string().trim().min(1).max(60);

export const SaveFilterSchema = z
  .object({
    module_key: ModuleKeySchema,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullish().transform((v) => v ?? null),
    filter_config: FilterConfigSchema.default({}),
    shared: z.boolean().default(false),
  })
  // .strict() keeps created_by, business_id, use_count and id server-owned: the
  // owner and scope come from the JWT, and use_count is only ever bumped by
  // POST /:id/apply. A client that sends one gets a 400, not a silent drop.
  .strict();

export type SaveFilterInput = z.infer<typeof SaveFilterSchema>;

export const ListFiltersQuerySchema = z.object({ module_key: ModuleKeySchema });

export const FilterIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const DefaultFilterQuerySchema = z.object({ module_key: ModuleKeySchema });

export const SetDefaultFilterSchema = z
  .object({
    module_key: ModuleKeySchema,
    /** null clears the default for this module. */
    filter_id: z.number().int().positive().nullable(),
  })
  .strict();
