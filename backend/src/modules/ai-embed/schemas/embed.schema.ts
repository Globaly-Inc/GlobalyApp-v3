import { z } from "zod";

import { webUrl } from "../../../shared/url.js";
import { normalizeOrigin } from "../services/origin.service.js";

/**
 * An allowed origin.
 *
 * Built on `webUrl()` (standing rule: never `z.string().url()`, which accepts
 * `javascript:` and `data:`) and then narrowed to something `normalizeOrigin`
 * accepts, so what is stored is always the canonical `scheme://host[:port]` the
 * runtime check compares against. Storing `https://Example.com/embed` and
 * comparing it raw is how an allowlist silently matches nothing.
 */
const allowedOrigin = webUrl({ max: 300 })
  .refine((v) => normalizeOrigin(v) !== null, {
    message: "Must be an http(s) origin, e.g. https://partner.example.com",
  })
  .transform((v) => normalizeOrigin(v) as string);

/** At least one origin, always. An empty allowlist is a config nothing can use. */
const allowedOrigins = z.array(allowedOrigin).min(1).max(20);

const brandColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a hex colour like #1a73e8");

// ── Public widget surface ────────────────────────────────────────────────────

export const ValidateEmbedSchema = z.object({
  embed_key: z.string().uuid(),
});

export const EmbedMessageSchema = z.object({
  embed_key: z.string().uuid(),
  content: z.string().trim().min(1).max(5000),
  /** Same anti-abuse fingerprint the guest counsellor uses. */
  fingerprint: z.string().min(1).max(200),
});

export const WidgetScriptQuerySchema = z.object({
  embed_key: z.string().uuid().optional(),
});

// ── Business-owner config management ────────────────────────────────────────

export const CreateEmbedConfigSchema = z.object({
  display_name: z.string().trim().min(1).max(120),
  allowed_origins: allowedOrigins,
  logo_url: webUrl().optional(),
  brand_color: brandColor.optional(),
  business_type: z.string().trim().min(1).max(60).optional(),
  custom_instructions: z.string().trim().max(4000).optional(),
  welcome_message: z.string().trim().max(500).optional(),
  starter_questions: z.array(z.string().trim().min(1).max(200)).max(6).optional(),
  scoped_institution_ids: z.array(z.coerce.number().int().positive()).max(100).optional(),
  scoped_agent_id: z.coerce.number().int().positive().optional(),
  monthly_credit_limit: z.coerce.number().int().min(0).max(1_000_000).optional(),
  overage_enabled: z.boolean().optional(),
});

export const UpdateEmbedConfigSchema = CreateEmbedConfigSchema.partial()
  .extend({ is_active: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const EmbedConfigIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type ValidateEmbedInput = z.infer<typeof ValidateEmbedSchema>;
export type EmbedMessageInput = z.infer<typeof EmbedMessageSchema>;
export type CreateEmbedConfigInput = z.infer<typeof CreateEmbedConfigSchema>;
export type UpdateEmbedConfigInput = z.infer<typeof UpdateEmbedConfigSchema>;
