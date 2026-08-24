import { z } from "zod";

export const POST_TYPES = ["social", "promotion", "update", "announcement"] as const;
export const VISIBILITIES = ["everyone", "business", "private"] as const;

export const ListPostsQuerySchema = z.object({
  postType: z.enum(["all", ...POST_TYPES]).optional(),
  limit: z.coerce.number().int().positive().max(50).default(20), // hard cap server-side
  cursor: z.string().optional(),
});

export const MediaItemSchema = z.object({
  storage_path: z.string().min(1),
  type: z.enum(["image", "video"]),
  mime_type: z.string().min(1),
});

export const MentionSchema = z.object({
  platform_user_id: z.number().int().positive(),
  first_name: z.string().nullable().default(null),
  last_name: z.string().nullable().default(null),
});

export const CreatePostSchema = z
  .object({
    // Content may be empty when the post carries media — enforced by the refine below.
    content: z.string().trim().max(5000).default(""),
    post_type: z.enum(POST_TYPES).default("social"),
    visibility: z.enum(VISIBILITIES).default("everyone"),
    business_id: z.number().int().positive().nullable().optional(),
    media: z.array(MediaItemSchema).max(4).default([]),
    mentions: z.array(MentionSchema).max(20).default([]),
  })
  // .strict() so an attempt to set author_platform_user_id is rejected loudly rather than silently
  // stripped — matching ProfilePatchSchema. The author always comes from the JWT.
  .strict()
  // A business-visible post with no business would be visible to nobody — reject the state outright
  // rather than storing something the visibility query can never match.
  .refine((v) => v.visibility !== "business" || v.business_id != null, {
    message: "business_id is required when visibility is 'business'",
    path: ["business_id"],
  })
  .refine((v) => v.content.length > 0 || v.media.length > 0, {
    message: "Add some text or attach an image or video",
    path: ["content"],
  });

export const ComposeWithAiSchema = z
  .object({
    post_type: z.enum(POST_TYPES).default("social"),
    draft: z.string().max(5000).nullable().optional(),
    instruction: z.string().max(500).nullable().optional(),
  })
  .strict();

export const PostIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const SetReactionSchema = z.object({ emoji: z.string().trim().min(1).max(16).default("👍") });

export const CommentIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  commentId: z.coerce.number().int().positive(),
});

export const ListCommentsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const CreateCommentSchema = z
  .object({
    // Content may be empty when the comment carries an image — enforced by the refine below.
    content: z.string().trim().max(2000).default(""),
    mentions: z.array(MentionSchema).max(20).default([]),
    media: z.array(MediaItemSchema).max(1).default([]),
  })
  .strict()
  .refine((v) => v.content.length > 0 || v.media.length > 0, {
    message: "Add some text or attach an image",
    path: ["content"],
  });

export type ListPostsQuery = z.infer<typeof ListPostsQuerySchema>;
export type CreatePostInput = z.infer<typeof CreatePostSchema>;
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;
