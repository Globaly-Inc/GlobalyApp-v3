// Feed service. Author identity always comes from the JWT — a client-supplied author is never honoured.

import { ForbiddenError, NotFoundError, BadRequestError } from "../../../shared/errors.js";
import * as repo from "../repositories/feed.repository.js";
import * as storage from "../../../shared/storage/storageService.js";

import * as mediaService from "./feed-media.service.js";
import type { CreateCommentInput, CreatePostInput, ListPostsQuery } from "../schemas/feed.schema.js";

async function withAvatarUrls<T extends object>(row: T): Promise<T> {
  const r = row as Record<string, unknown>;
  const hasAuthorPhoto = "author_photo_url" in r;
  const hasBusinessLogo = "business_logo_url" in r;
  const hasInstitutionLogo = "institution_logo_url" in r;
  const [author_photo_url, business_logo_url, institution_logo_url] = await Promise.all([
    hasAuthorPhoto ? storage.resolvePreviewUrl(r.author_photo_url as string | null) : undefined,
    hasBusinessLogo ? storage.resolvePreviewUrl(r.business_logo_url as string | null) : undefined,
    hasInstitutionLogo ? storage.resolvePreviewUrl(r.institution_logo_url as string | null) : undefined,
  ]);
  return {
    ...row,
    ...(hasAuthorPhoto && { author_photo_url }),
    ...(hasBusinessLogo && { business_logo_url }),
    ...(hasInstitutionLogo && { institution_logo_url }),
  };
}

export async function listPosts(viewerId: number, query: ListPostsQuery) {
  const cursor = query.cursor ? repo.decodeCursor(query.cursor) : null;
  if (query.cursor && !cursor) throw new BadRequestError("Invalid cursor");

  const page = await repo.listPosts({
    viewerId,
    postType: query.postType,
    limit: query.limit,
    cursor,
  });

  // One reaction query for the whole page — per-post would be an N+1 on the timeline's hot path.
  const summaries = await repo.reactionSummaries(page.posts.map((post) => post.id));

  // Signed view URLs are minted per read (they expire), never stored on the post.
  const posts = await Promise.all(
    page.posts.map(async ({ cursor_ts: _cursorTs, ...post }) => ({
      ...(await withAvatarUrls(post)),
      media: await mediaService.withViewUrls(post.media),
      reactions: summaries.get(post.id) ?? [],
    })),
  );
  return { ...page, posts };
}

export async function createPost(authorId: number, input: CreatePostInput) {
  // Posting to a business or institution feed requires actually being a member of it.
  if (input.business_id != null) {
    const isMember = await repo.isBusinessMember(authorId, input.business_id);
    if (!isMember) throw new ForbiddenError("You are not a member of that business");
  }
  if (input.institution_id != null) {
    const isMember = await repo.isInstitutionMember(authorId, input.institution_id);
    if (!isMember) throw new ForbiddenError("You are not a member of that institution");
  }

  // Only media this caller actually uploaded may be attached — otherwise a client could reference any
  // storage path it could guess.
  await mediaService.assertOwnedMedia(authorId, input.media);

  const inserted = await repo.insertPost({
    author_platform_user_id: authorId,
    business_id: input.business_id ?? null,
    institution_id: input.institution_id ?? null,
    post_type: input.post_type,
    visibility: input.visibility,
    content: input.content,
    media: input.media,
    mentions: input.mentions,
  });

  // Read it back through the same query the timeline uses, so the response carries the author card and
  // is_mine. Returning the bare inserted row is what made a new post render as "Someone" until a reload.
  const hydrated = (await repo.findPostForViewer(inserted.id, authorId)) ?? inserted;
  const { cursor_ts: _cursorTs, ...post } = hydrated as typeof hydrated & { cursor_ts?: string };
  // `reactions: []` keeps the create response key-for-key identical to a listed post.
  return { ...(await withAvatarUrls(post)), media: await mediaService.withViewUrls(post.media), reactions: [] };
}
export async function createSystemPost(input: {
  authorId: number;
  businessId?: number | null;
  institutionId?: number | null;
  content: string;
  media?: { storage_path: string; type: "image" | "video"; mime_type: string }[];
}) {
  await repo.insertPost({
    author_platform_user_id: input.authorId,
    business_id: input.businessId ?? null,
    institution_id: input.institutionId ?? null,
    post_type: "announcement",
    visibility: "everyone",
    content: input.content,
    media: input.media ?? [],
    mentions: [],
  });
}

export async function deletePost(postId: number, callerId: number) {
  const post = await repo.findPost(postId);
  if (!post) throw new NotFoundError("Post not found");
  if (post.author_platform_user_id !== callerId) throw new ForbiddenError("Not your post");
  await repo.softDeletePost(postId);
}

/** Explicit add/update — not a toggle. The client knows its own current reaction and picks the method. */
export async function setReaction(postId: number, callerId: number, emoji: string) {
  const post = await repo.findVisiblePost(postId, callerId);
  if (!post) throw new NotFoundError("Post not found");
  return repo.setReaction(postId, callerId, emoji);
}

export async function removeReaction(postId: number, callerId: number) {
  const post = await repo.findVisiblePost(postId, callerId);
  if (!post) throw new NotFoundError("Post not found");
  return repo.removeReaction(postId, callerId);
}

export async function listComments(postId: number, viewerId: number) {
  const post = await repo.findVisiblePost(postId, viewerId);
  if (!post) throw new NotFoundError("Post not found");
  const comments = await repo.listComments(postId, viewerId);

  // One reaction query for the whole thread — per-comment would be an N+1.
  const summaries = await repo.commentReactionSummaries(comments.map((c) => c.id));

  return Promise.all(
    comments.map(async (c) => ({
      ...(await withAvatarUrls(c)),
      media: await mediaService.withViewUrls(c.media),
      reactions: summaries.get(c.id) ?? [],
    })),
  );
}

export async function addComment(postId: number, callerId: number, input: CreateCommentInput) {
  const post = await repo.findVisiblePost(postId, callerId);
  if (!post) throw new NotFoundError("Post not found");

  // Only media this caller actually uploaded may be attached — same rule as post media.
  await mediaService.assertOwnedMedia(callerId, input.media);

  const comment = await repo.insertComment({
    post_id: postId,
    author_platform_user_id: callerId,
    content: input.content,
    mentions: input.mentions,
    media: input.media,
  });
  return { ...(await withAvatarUrls(comment)), media: await mediaService.withViewUrls(comment.media), reactions: [] };
}

async function requireVisibleComment(postId: number, commentId: number, viewerId: number) {
  const post = await repo.findVisiblePost(postId, viewerId);
  if (!post) throw new NotFoundError("Comment not found");
  const comment = await repo.findComment(commentId);
  if (!comment || comment.post_id !== postId) throw new NotFoundError("Comment not found");
  return comment;
}

export async function deleteComment(postId: number, commentId: number, callerId: number) {
  const comment = await requireVisibleComment(postId, commentId, callerId);
  if (comment.author_platform_user_id !== callerId) throw new ForbiddenError("Not your comment");
  await repo.softDeleteComment(commentId, postId);
}

/** Explicit add/update — not a toggle, mirrors post reactions. */
export async function setCommentReaction(postId: number, commentId: number, callerId: number, emoji: string) {
  await requireVisibleComment(postId, commentId, callerId);
  return repo.setCommentReaction(commentId, callerId, emoji);
}

export async function removeCommentReaction(postId: number, commentId: number, callerId: number) {
  await requireVisibleComment(postId, commentId, callerId);
  return repo.removeCommentReaction(commentId, callerId);
}
