// Validation schemas for the SEO/AEO admin feature. Rankings/suggestions/readiness are
// parameterless GETs and the action-plan POST takes no body, so the only real boundary
// to validate is Gemini's action-plan response — untrusted external output.

import { z } from "zod";

export const ActionPlanItemSchema = z.object({
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  action: z.string().min(1).max(500),
  keyword: z.string().min(1).max(200).optional(),
  blog_slug: z.string().min(1).max(300).optional(),
});

export const ActionPlanArraySchema = z.array(ActionPlanItemSchema);

export type ActionPlanItem = z.infer<typeof ActionPlanItemSchema>;
