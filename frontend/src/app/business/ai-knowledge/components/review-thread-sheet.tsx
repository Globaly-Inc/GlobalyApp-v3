"use client";

import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { reviewMessage } from "../store/ai-knowledge-reviews-slice";
import type { ReviewInput, ReviewSession } from "../apis/types";
import { ReviewMessageRowView } from "./review-message";

/**
 * One widget conversation, with a review control on every reply.
 *
 * The visitor is deliberately not named here. The review endpoints return the thread and nothing
 * about who sent it — a reply is judged on whether it was a good answer, and the person who asked
 * is in the Visitors list if they ever handed over their details.
 */
export function ReviewThreadSheet({
  session, open, onOpenChange,
}: Readonly<{ session: ReviewSession | null; open: boolean; onOpenChange: (open: boolean) => void }>) {
  const dispatch = useAppDispatch();
  const { threads, threadStatus, reviewStatus, error } = useAppSelector((s) => s.aiKnowledgeReviews);

  if (!session) return null;
  const messages = threads[session.id] ?? [];
  const loading = threadStatus[session.id] === "loading";
  const failed = threadStatus[session.id] === "failed";

  const handleReview = async (messageId: number, review: ReviewInput): Promise<boolean> => {
    const result = await dispatch(reviewMessage({ sessionId: session.id, messageId, review }));
    return reviewMessage.fulfilled.match(result);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{session.title ?? `Conversation ${session.id}`}</SheetTitle>
          <SheetDescription>
            {session.unreviewed > 0
              ? `${session.unreviewed} ${session.unreviewed === 1 ? "reply" : "replies"} still to look at.`
              : "Every reply here has been reviewed."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          <p className="rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
            Marking a reply good reinforces the rules it followed. Marking it wrong votes against
            them. A correction is the only one that teaches something new — your wording is stored
            as your institution&apos;s, and a rule may be drawn from it for you to review.
          </p>

          {error && reviewStatus === "failed" && <p className="text-sm text-destructive">{error}</p>}

          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          )}

          {failed && (
            <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              Couldn&apos;t load this conversation.
            </p>
          )}

          {!loading && !failed && messages.map((message) => (
            <ReviewMessageRowView
              key={message.id}
              message={message}
              onReview={handleReview}
              busy={reviewStatus === "loading"}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
