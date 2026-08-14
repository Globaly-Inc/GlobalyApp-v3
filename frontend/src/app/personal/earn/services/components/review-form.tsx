"use client";

import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import type { Review } from "../apis";
import { createReview, fetchMyReview } from "../store/my-services-slice";
import { formatDate } from "../utils";

/** Shared by the picker and the read-only display, so a 4 always draws the same way. */
function Stars({ value, size = "sm" }: Readonly<{ value: number; size?: "sm" | "lg" }>) {
  return (
    <>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            size === "lg" ? "h-6 w-6" : "h-5 w-5",
            n <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground",
          )}
        />
      ))}
    </>
  );
}

/**
 * Leave a review on a listing.
 *
 * Keyed on the listing, not on an order: buying is no longer required. The server decides eligibility and
 * says why when it refuses — this component never infers it, so it cannot offer a form the server would
 * reject. Rendered only for a signed-in viewer; the public page shows the reviews without it otherwise.
 */
export function ReviewForm({ serviceId }: Readonly<{ serviceId: number }>) {
  const dispatch = useAppDispatch();
  const { myReview, myReviewStatus, saving } = useAppSelector((state) => state.myServices);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  // Strict Mode double-invokes effects (frontend/AGENTS.md).
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchMyReview(serviceId));
  }, [dispatch, serviceId]);

  const submit = async () => {
    const result = await dispatch(createReview({ serviceId, rating, comment: comment.trim() || null }));
    if (createReview.rejected.match(result)) {
      toast.error("Couldn't post your review", { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success("Review posted");
  };

  // Nothing until we know — an eligibility flash would offer a form and then snatch it away.
  if (myReviewStatus !== "idle" || !myReview) return null;

  if (myReview.review) return <SubmittedReview review={myReview.review} />;

  // A seller's own listing. Said plainly rather than silently hiding the section.
  if (myReview.reason === "own_listing") {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
        This is your service, so you can&apos;t review it.
      </p>
    );
  }

  if (!myReview.can_review) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Leave a review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
              className="cursor-pointer p-0.5"
            >
              <Star
                className={cn(
                  "h-6 w-6 transition-colors",
                  value <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground",
                )}
              />
            </button>
          ))}
        </div>

        <Textarea
          rows={3}
          value={comment}
          placeholder="How was it? (optional)"
          onChange={(e) => setComment(e.target.value)}
        />

        <Button className="w-full" onClick={submit} disabled={saving}>
          {saving ? "Posting…" : "Submit Review"}
        </Button>
      </CardContent>
    </Card>
  );
}

/** The submitted review, replacing the form once it exists. */
export function SubmittedReview({ review }: Readonly<{ review: Review }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-1">
          <Stars value={review.rating} />
          <span className="ml-2 text-xs text-muted-foreground">{formatDate(review.created_at)}</span>
        </div>
        {review.comment && <p className="text-sm text-foreground">{review.comment}</p>}
      </CardContent>
    </Card>
  );
}
