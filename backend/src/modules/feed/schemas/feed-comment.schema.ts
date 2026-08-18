import { z } from "zod";

export const ListCommentsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20), // hard cap server-side
  cursor: z.string().optional(),
});

export const CreateCommentSchema = z
  .object({
    content: z.string().trim().min(1).max(2000),
    parent_comment_id: z.number().int().positive().nullable().optional(),
  })
  // .strict() so an attempt to set author_platform_user_id is rejected loudly rather than
  // silently stripped — matching CreatePostSchema. The author always comes from the JWT.
  .strict();

export const UpdateCommentSchema = z.object({ content: z.string().trim().min(1).max(2000) }).strict();

export const CommentIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export type ListCommentsQuery = z.infer<typeof ListCommentsQuerySchema>;
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;
