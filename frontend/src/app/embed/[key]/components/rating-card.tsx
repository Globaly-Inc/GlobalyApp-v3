"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const FACES = [
  { value: 1, emoji: "😞", label: "Very bad" },
  { value: 2, emoji: "🙁", label: "Bad" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😍", label: "Great" },
] as const;

/**
 * "How was this chat?" after the visitor ends it. A low score asks what went wrong, optionally;
 * anything else is thanked straight away.
 */
export function RatingCard({ onRate }: Readonly<{ onRate: (rating: number, comment?: string) => void }>) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);

  const pick = (value: number) => {
    setRating(value);
    if (value > 2) {
      onRate(value);
      setDone(true);
    }
  };

  if (done) return <p className="text-center text-xs text-muted-foreground">Thanks for your feedback!</p>;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="mb-2 text-center text-sm font-semibold">How was this chat?</p>
      <div className="flex justify-center gap-2">
        {FACES.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-label={f.label}
            title={f.label}
            aria-pressed={rating === f.value}
            onClick={() => pick(f.value)}
            className={cn(
              "rounded-full p-1.5 text-2xl leading-none transition-transform hover:scale-110",
              rating === f.value && "bg-muted",
            )}
          >
            {f.emoji}
          </button>
        ))}
      </div>
      {rating !== null && rating <= 2 && (
        <div className="mt-3 flex flex-col gap-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="What could we have done better? (optional)"
          />
          <Button
            size="sm"
            onClick={() => {
              onRate(rating, comment.trim() || undefined);
              setDone(true);
            }}
          >
            Send feedback
          </Button>
        </div>
      )}
    </div>
  );
}
