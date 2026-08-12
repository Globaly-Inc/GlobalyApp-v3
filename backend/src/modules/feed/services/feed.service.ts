// Feed service. Author identity always comes from the JWT — a client-supplied author is never honoured.

import { ForbiddenError, NotFoundError, BadRequestError } from "../../../shared/errors.js";
import * as repo from "../repositories/feed.repository.js";
import * as membershipRepo from "../../platform-users/repositories/memberships.repository.js";
import * as mediaService from "./feed-media.service.js";
import type { CreatePostInput, ListPostsQuery } from "../schemas/feed.schema.js";

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
      ...post,
      media: await mediaService.withViewUrls(post.media),
      reactions: summaries.get(post.id) ?? [],
    })),
  );
  return { ...page, posts };
}

export async function createPost(authorId: number, input: CreatePostInput) {
  // Posting to a business feed requires actually being in that business.
  if (input.business_id != null) {
    const isMember = await membershipRepo.membershipExists(authorId, input.business_id);
    if (!isMember) throw new ForbiddenError("You are not a member of that business");
  }

  // Only media this caller actually uploaded may be attached — otherwise a client could reference any
  // storage path it could guess.
  await mediaService.assertOwnedMedia(authorId, input.media);

  const inserted = await repo.insertPost({
    author_platform_user_id: authorId,
    business_id: input.business_id ?? null,
    post_type: input.post_type,
    visibility: input.visibility,
    content: input.content,
    media: input.media,
  });

  // Read it back through the same query the timeline uses, so the response carries the author card and
  // is_mine. Returning the bare inserted row is what made a new post render as "Someone" until a reload.
  const hydrated = (await repo.findPostForViewer(inserted.id, authorId)) ?? inserted;
  const { cursor_ts: _cursorTs, ...post } = hydrated as typeof hydrated & { cursor_ts?: string };
  // `reactions: []` keeps the create response key-for-key identical to a listed post.
  return { ...post, media: await mediaService.withViewUrls(post.media), reactions: [] };
}

export async function deletePost(postId: number, callerId: number) {
  const post = await repo.findPost(postId);
  if (!post) throw new NotFoundError("Post not found");
  if (post.author_platform_user_id !== callerId) throw new ForbiddenError("Not your post");
  await repo.softDeletePost(postId);
}

/** Explicit add/update — not a toggle. The client knows its own current reaction and picks the method. */
export async function setReaction(postId: number, callerId: number, emoji: string) {
  const post = await repo.findPost(postId);
  if (!post) throw new NotFoundError("Post not found");
  return repo.setReaction(postId, callerId, emoji);
}

export async function removeReaction(postId: number, callerId: number) {
  const post = await repo.findPost(postId);
  if (!post) throw new NotFoundError("Post not found");
  return repo.removeReaction(postId, callerId);
}
