import { z } from "zod";

export const POST_TYPES = ["social", "promotion", "update", "announcement"] as const;
/**
 * Audiences, all enforced in the list query rather than merely labelled — see feed.repository.listPosts.
 * The author is always an audience for their own post.
 *
 *  everyone  every user with a personal portal (is_personal_account), plus anyone reading a business
 *            portal they belong to. This is the ONLY audience that crosses between a user's personal
 *            portal and their business portal.
 *  students  personal users who look like students — individual_category "student", OR any of the three
 *            profile sections a student fills in: study preferences, test scores, education background.
 *            Decided server-side; see feed.repository.viewerAudience for why the category alone is not
 *            sufficient.
 *  business  members of the post's business, per user_business_index
 *  private   the author only
 *
 * Every audience except "everyone" is additionally scoped to the portal the post was written from: a
 * students-only post written in the personal portal is invisible in the same user's business portal, and
 * vice versa. Ownership alone never grants cross-portal visibility — see listPosts.
 */
export const VISIBILITIES = ["everyone", "students", "business", "private"] as const;

export const ListPostsQuerySchema = z.object({
  postType: z.enum(["all", ...POST_TYPES]).optional(),
  limit: z.coerce.number().int().positive().max(50).default(20), // hard cap server-side
  cursor: z.string().optional(),
  /**
   * Which portal the timeline is read from: absent = the personal portal, a business id = that business's
   * portal. Membership is verified server-side before it is honoured.
   *
   * Deliberately NOT taken from the JWT's `orgId` claim. That claim persists in localStorage while the same
   * user browses their personal portal, so it says which business they *may* act as, not which portal they
   * are looking at. The caller states the context; the server authorizes it.
   */
  businessId: z.coerce.number().int().positive().optional(),
});

export const MediaItemSchema = z.object({
  storage_path: z.string().min(1),
  type: z.enum(["image", "video"]),
  mime_type: z.string().min(1),
});

export const CreatePostSchema = z
  .object({
    // Content may be empty when the post carries media — enforced by the refine below.
    content: z.string().trim().max(5000).default(""),
    post_type: z.enum(POST_TYPES).default("social"),
    visibility: z.enum(VISIBILITIES).default("everyone"),
    business_id: z.number().int().positive().nullable().optional(),
    media: z.array(MediaItemSchema).max(4).default([]),
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

export type ListPostsQuery = z.infer<typeof ListPostsQuerySchema>;
export type CreatePostInput = z.infer<typeof CreatePostSchema>;
