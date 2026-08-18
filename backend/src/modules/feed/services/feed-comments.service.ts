// Feed comments service. Author identity always comes from the JWT — a client-supplied author
// is never honoured. Post visibility is re-checked on every entry point, so a post the caller
// cannot see behaves exactly like a post that does not exist.

import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import * as postRepo from "../repositories/feed.repository.js";
import * as repo from "../repositories/feed-comments.repository.js";
import type { CreateCommentInput, ListCommentsQuery } from "../schemas/feed-comment.schema.js";

/** Caller identity for a comment write: a platform user, or an admin acting as a moderator. */
export interface Caller {
  userId: number;
  isAdmin: boolean;
}

/** `cursor_ts` is an implementation detail of the keyset — never part of the response. */
function strip<T extends Record<string, unknown>>(row: T) {
  const { cursor_ts: _cursorTs, ...rest } = row;
  return rest;
}

async function assertVisiblePost(postId: number, viewerId: number) {
  const post = await postRepo.findVisiblePost(postId, viewerId);
  if (!post) throw new NotFoundError("Post not found");
  return post;
}

export async function listComments(postId: number, viewerId: number, query: ListCommentsQuery) {
  await assertVisiblePost(postId, viewerId);

  const cursor = query.cursor ? repo.decodeCommentCursor(query.cursor) : null;
  if (query.cursor && !cursor) throw new BadRequestError("Invalid cursor");

  const page = await repo.listComments({ postId, viewerId, limit: query.limit, cursor });
  return { comments: page.comments.map(strip), next_cursor: page.next_cursor };
}

export async function addComment(postId: number, authorId: number, input: CreateCommentInput) {
  await assertVisiblePost(postId, authorId);

  // A reply must belong to the same post, or the thread would splice two posts together.
  if (input.parent_comment_id != null) {
    const parent = await repo.findComment(input.parent_comment_id);
    if (!parent || parent.post_id !== postId) throw new BadRequestError("Parent comment is not on this post");
  }

  const id = await repo.insertComment({
    post_id: postId,
    author_platform_user_id: authorId,
    parent_comment_id: input.parent_comment_id ?? null,
    content: input.content,
  });

  // Read back through the same query the list uses, so the create response is key-for-key
  // identical to a listed comment — the drift that made a new feed post render as "Someone".
  const hydrated = await repo.findCommentForViewer(id, authorId);
  if (!hydrated) throw new NotFoundError("Comment not found");
  return strip(hydrated);
}

/** Editing is author-only. Moderation is a delete, never a rewrite of someone else's words. */
export async function editComment(commentId: number, callerId: number, content: string) {
  const comment = await repo.findComment(commentId);
  if (!comment) throw new NotFoundError("Comment not found");
  if (comment.author_platform_user_id !== callerId) throw new ForbiddenError("Not your comment");

  await repo.updateComment(commentId, content);
  const hydrated = await repo.findCommentForViewer(commentId, callerId);
  if (!hydrated) throw new NotFoundError("Comment not found");
  return strip(hydrated);
}

/**
 * Soft delete. The author removes their own; an admin moderates anyone's.
 *
 * A non-author non-admin gets 403 rather than 404 — unlike the post lookups above, the comment's
 * existence is not a secret here: the caller can already see it in the thread they are reading.
 */
export async function deleteComment(commentId: number, caller: Caller) {
  const comment = await repo.findComment(commentId);
  if (!comment) throw new NotFoundError("Comment not found");
  if (!caller.isAdmin && comment.author_platform_user_id !== caller.userId) {
    throw new ForbiddenError("Not your comment");
  }
  await repo.softDeleteComment(commentId, comment.post_id);
}
