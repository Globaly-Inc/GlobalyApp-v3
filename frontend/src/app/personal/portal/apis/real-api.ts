import { httpDelete, httpGet, httpPatch, httpPost, httpPostForm, httpPostNoContent } from "@/lib/api/http";
import type {
  ComposeWithAiInput,
  CreatePostInput,
  FeedComment,
  FeedCommentPage,
  FeedPage,
  FeedPost,
  PostMedia,
} from "./types";

/**
 * Normalize at the boundary.
 *
 * The types describe the contract, but at runtime the response is whatever the deployed backend sends — an
 * older build, a partial payload, a proxy that drops a field. A component doing `post.media.length` on a
 * missing array throws during render and takes the whole page down, so every array and scalar the UI indexes
 * into gets a default here, once, rather than a `?.` in each of a dozen call sites.
 */

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizePost(raw: Partial<FeedPost> | undefined | null): FeedPost {
  const post = raw ?? {};
  return {
    id: Number(post.id ?? 0),
    author_platform_user_id: Number(post.author_platform_user_id ?? 0),
    business_id: post.business_id ?? null,
    post_type: post.post_type ?? "social",
    visibility: post.visibility ?? "everyone",
    content: post.content ?? "",
    media: toArray<PostMedia>(post.media),
    is_pinned: !!post.is_pinned,
    reactions_count: Number(post.reactions_count ?? 0),
    comments_count: Number(post.comments_count ?? 0),
    created_at: post.created_at ?? new Date().toISOString(),
    author_first_name: post.author_first_name ?? null,
    author_last_name: post.author_last_name ?? null,
    author_photo_url: post.author_photo_url ?? null,
    business_name: post.business_name ?? null,
    business_logo_url: post.business_logo_url ?? null,
    my_reaction: post.my_reaction ?? null,
    is_mine: !!post.is_mine,
    reactions: toArray(post.reactions),
  };
}

function normalizeComment(raw: Partial<FeedComment> | undefined | null): FeedComment {
  const comment = raw ?? {};
  return {
    id: Number(comment.id ?? 0),
    post_id: Number(comment.post_id ?? 0),
    author_platform_user_id: Number(comment.author_platform_user_id ?? 0),
    parent_comment_id: comment.parent_comment_id ?? null,
    content: comment.content ?? "",
    created_at: comment.created_at ?? new Date().toISOString(),
    updated_at: comment.updated_at ?? comment.created_at ?? new Date().toISOString(),
    author_first_name: comment.author_first_name ?? null,
    author_last_name: comment.author_last_name ?? null,
    author_photo_url: comment.author_photo_url ?? null,
    is_mine: !!comment.is_mine,
  };
}

export const homeRealApi = {
  listFeed: async (params: { postType?: string; cursor?: string | null; limit?: number }): Promise<FeedPage> => {
    const query = new URLSearchParams();
    if (params.postType && params.postType !== "all") query.set("postType", params.postType);
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.limit) query.set("limit", String(params.limit));
    const suffix = query.toString();
    const page = await httpGet<Partial<FeedPage>>(`/feed/posts${suffix ? `?${suffix}` : ""}`);
    return { posts: toArray<Partial<FeedPost>>(page?.posts).map(normalizePost), next_cursor: page?.next_cursor ?? null };
  },

  createPost: async (input: CreatePostInput): Promise<FeedPost> =>
    normalizePost(await httpPost<Partial<FeedPost>>("/feed/posts", input)),

  uploadMedia: (file: File): Promise<PostMedia> => {
    const form = new FormData();
    form.append("file", file);
    return httpPostForm("/feed/media", form);
  },

  aiAvailable: (): Promise<{ available: boolean }> => httpGet("/feed/ai/available"),

  composeWithAi: (input: ComposeWithAiInput): Promise<{ content: string }> => httpPost("/feed/ai/compose", input),

  deletePost: (id: number): Promise<void> => httpDelete(`/feed/posts/${id}`),

  // Explicit add/update vs remove — the API has no toggle, so neither does this client.
  setReaction: (id: number, emoji: string): Promise<void> =>
    httpPostNoContent(`/feed/posts/${id}/reactions`, { emoji }),
  removeReaction: (id: number): Promise<void> => httpDelete(`/feed/posts/${id}/reactions`),

  // ── Comments ──
  listComments: async (postId: number, cursor?: string | null): Promise<FeedCommentPage> => {
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const page = await httpGet<Partial<FeedCommentPage>>(`/feed/posts/${postId}/comments${suffix}`);
    return {
      comments: toArray<Partial<FeedComment>>(page?.comments).map(normalizeComment),
      next_cursor: page?.next_cursor ?? null,
    };
  },

  addComment: async (postId: number, content: string): Promise<FeedComment> =>
    normalizeComment(await httpPost<Partial<FeedComment>>(`/feed/posts/${postId}/comments`, { content })),

  editComment: async (id: number, content: string): Promise<FeedComment> =>
    normalizeComment(await httpPatch<Partial<FeedComment>>(`/feed/comments/${id}`, { content })),

  deleteComment: (id: number): Promise<void> => httpDelete(`/feed/comments/${id}`),
};
