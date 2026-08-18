"use client";

import { useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { addComment, deleteComment, editComment, fetchComments } from "../store/home-slice";
import { initials, relativeTime } from "../utils";
import type { FeedComment } from "../apis/types";

const COMMENT_MAX_CHARS = 2000;

/** One comment. Edit and delete only ever render for `is_mine`, which the server decides. */
function CommentRow({ comment }: { comment: FeedComment }) {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [busy, setBusy] = useState(false);

  const authorName = `${comment.author_first_name ?? ""} ${comment.author_last_name ?? ""}`.trim();

  const save = async () => {
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    const result = await dispatch(editComment({ id: comment.id, content }));
    setBusy(false);
    if (editComment.rejected.match(result)) {
      toast.error("Couldn't save the edit", { description: result.error.message });
      return;
    }
    setEditing(false);
  };

  const remove = async () => {
    setBusy(true);
    const result = await dispatch(deleteComment({ id: comment.id, postId: comment.post_id }));
    setBusy(false);
    if (deleteComment.rejected.match(result)) {
      toast.error("Couldn't delete the comment", { description: result.error.message });
    }
  };

  return (
    <div className="flex items-start gap-2">
      <Avatar className="size-7 shrink-0">
        {comment.author_photo_url && <AvatarImage src={comment.author_photo_url} alt={authorName} />}
        <AvatarFallback className="text-[10px]">
          {initials(comment.author_first_name, comment.author_last_name)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="rounded-lg bg-muted px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">{authorName || "Someone"}</span>
            <span className="text-[11px] text-muted-foreground">{relativeTime(comment.created_at)}</span>
          </div>
          {editing ? (
            <div className="mt-1.5 space-y-1.5">
              <Textarea
                value={draft}
                maxLength={COMMENT_MAX_CHARS}
                onChange={(event) => setDraft(event.target.value)}
                className="min-h-16 text-sm"
              />
              <div className="flex gap-1.5">
                <Button size="sm" className="cursor-pointer gap-1.5" disabled={busy || !draft.trim()} onClick={save}>
                  {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="cursor-pointer"
                  disabled={busy}
                  onClick={() => {
                    setDraft(comment.content);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">{comment.content}</p>
          )}
        </div>

        {comment.is_mine && !editing && (
          <div className="flex gap-3 pl-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The thread under one post.
 *
 * Rendered only once the user opens it, and it fetches from an event handler rather than an
 * effect — the timeline can hold dozens of posts, and an effect per card would fire a request
 * for every thread nobody asked to read.
 */
export function FeedComments({ postId }: { postId: number }) {
  const dispatch = useAppDispatch();
  const thread = useAppSelector((state) => state.home.commentsByPost[postId]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const items = thread?.items ?? [];

  const submit = async () => {
    const content = draft.trim();
    if (!content) return;
    setPosting(true);
    const result = await dispatch(addComment({ postId, content }));
    setPosting(false);
    if (addComment.rejected.match(result)) {
      toast.error("Couldn't post the comment", { description: result.error.message });
      return;
    }
    setDraft("");
  };

  return (
    <div className="-mx-4 space-y-3 border-t border-border px-4 py-3">
      {thread?.status === "loading" && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading comments…
        </p>
      )}

      {thread?.status === "failed" && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <span>{thread.error}</span>
          <button
            type="button"
            className="cursor-pointer font-medium underline"
            onClick={() => dispatch(fetchComments({ postId }))}
          >
            Retry
          </button>
        </div>
      )}

      {items.map((comment) => (
        <CommentRow key={comment.id} comment={comment} />
      ))}

      {thread?.nextCursor && (
        <Button
          size="sm"
          variant="ghost"
          className="cursor-pointer text-xs"
          disabled={thread.loadingMore}
          onClick={() => dispatch(fetchComments({ postId, cursor: thread.nextCursor }))}
        >
          {thread.loadingMore ? "Loading…" : "Show earlier comments"}
        </Button>
      )}

      <div className="space-y-1.5">
        <Textarea
          value={draft}
          maxLength={COMMENT_MAX_CHARS}
          placeholder="Write a comment…"
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-16 text-sm"
        />
        <Button size="sm" className="cursor-pointer gap-1.5" disabled={posting || !draft.trim()} onClick={submit}>
          {posting && <Loader2 className="h-3 w-3 animate-spin" />}
          Comment
        </Button>
      </div>
    </div>
  );
}
