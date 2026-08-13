"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import type { Review } from "../apis";
import { createReview } from "../store/my-services-slice";
import { formatDate } from "../utils";

/**
 * Buyer-only, and only once the order closed. A provider never sees this at any status — the server enforces
 * both, and `can_review` is decided there too, so the client never infers eligibility.
 */
export function ReviewForm({ orderId }: Readonly<{ orderId: number }>) {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((state) => state.myServices.saving);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const submit = async () => {
    const result = await dispatch(createReview({ orderId, rating, comment: comment.trim() || null }));
    if (createReview.rejected.match(result)) {
      toast.error("Couldn't post your review", { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success("Review posted");
  };

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
          placeholder="How did it go? (optional)"
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
          {[1, 2, 3, 4, 5].map((value) => (
            <Star
              key={value}
              className={cn(
                "h-5 w-5",
                value <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground",
              )}
            />
          ))}
          <span className="ml-2 text-xs text-muted-foreground">{formatDate(review.created_at)}</span>
        </div>
        {review.comment && <p className="text-sm text-foreground">{review.comment}</p>}
      </CardContent>
    </Card>
  );
}
