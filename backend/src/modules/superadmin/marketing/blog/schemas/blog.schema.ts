// Validation schemas for the blog admin feature — posts + keywords.

import { z } from "zod";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });

const slug = z.string().trim().min(1).max(300).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens");

// z.coerce.boolean() coerces via JS `Boolean(value)`, so the *string* "false" — exactly
// what a query param carries — comes out `true`. Only "true"/"false" text is accepted here.
const booleanQueryParam = z.enum(["true", "false"]).transform((v) => v === "true");

export const PostInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  slug,
  excerpt: z.string().max(500).nullable().optional(),
  content: z.string().nullable().optional(),
  category: z.string().max(50).nullable().optional(),
  country_focus: z.string().max(100).nullable().optional(),
  tags: z.array(z.string()).optional(),
  author_name: z.string().max(200).nullable().optional(),
  author_avatar_url: z.string().url().nullable().optional(),
  cover_image_url: z.string().url().nullable().optional(),
  is_published: z.boolean().optional(),
  meta_title: z.string().max(60).nullable().optional(),
  meta_description: z.string().max(160).nullable().optional(),
  focus_keyword: z.string().max(200).nullable().optional(),
  canonical_url: z.string().url().nullable().optional(),
  og_image_url: z.string().url().nullable().optional(),
});

export const PostListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  category: z.string().min(1).optional(),
  is_published: booleanQueryParam.optional(),
});

export const KeywordInputSchema = z.object({
  keyword: z.string().trim().min(1).max(200),
  category: z.string().max(100).nullable().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(),
  is_active: z.boolean().optional(),
});

export const KeywordListQuery = z.object({
  is_active: booleanQueryParam.optional(),
});

export type PostInput = z.infer<typeof PostInputSchema>;
export type KeywordInput = z.infer<typeof KeywordInputSchema>;
