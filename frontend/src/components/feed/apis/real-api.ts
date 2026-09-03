import { httpDelete, httpGet, httpPost, httpPostForm, httpPostNoContent } from "@/lib/api/http";
import type { ComposeWithAiInput, CreateCommentInput, CreatePostInput, FeedComment, FeedPage, FeedPost, Mention, PostMedia } from "./types";

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

function normalizeComment(raw: Partial<FeedComment> | undefined | null): FeedComment {
  const c = raw ?? {};
  return {
    id: Number(c.id ?? 0),
    post_id: Number(c.post_id ?? 0),
    author_platform_user_id: Number(c.author_platform_user_id ?? 0),
    content: c.content ?? "",
    mentions: toArray<Mention>(c.mentions),
    media: toArray<PostMedia>(c.media),
    created_at: c.created_at ?? new Date().toISOString(),
    author_first_name: c.author_first_name ?? null,
    author_last_name: c.author_last_name ?? null,
    author_photo_url: c.author_photo_url ?? null,
    is_mine: !!c.is_mine,
    reactions_count: Number(c.reactions_count ?? 0),
    my_reaction: c.my_reaction ?? null,
    reactions: toArray(c.reactions),
  };
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
    mentions: toArray<Mention>(post.mentions),
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

export const feedRealApi = {
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

  listComments: async (postId: number): Promise<FeedComment[]> => {
    const res = await httpGet<{ data?: Partial<FeedComment>[] }>(`/feed/posts/${postId}/comments`);
    return toArray<Partial<FeedComment>>(res?.data).map(normalizeComment);
  },
  addComment: async (postId: number, input: CreateCommentInput): Promise<FeedComment> =>
    normalizeComment(await httpPost<Partial<FeedComment>>(`/feed/posts/${postId}/comments`, input)),
  deleteComment: (postId: number, commentId: number): Promise<void> =>
    httpDelete(`/feed/posts/${postId}/comments/${commentId}`),

  setCommentReaction: (postId: number, commentId: number, emoji: string): Promise<void> =>
    httpPostNoContent(`/feed/posts/${postId}/comments/${commentId}/reactions`, { emoji }),
  removeCommentReaction: (postId: number, commentId: number): Promise<void> =>
    httpDelete(`/feed/posts/${postId}/comments/${commentId}/reactions`),
};
