"use client";

import { useState } from "react";
import { Check, Flag, PencilLine, ThumbsDown, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/components/feed/utils";
import { REVIEW_META } from "../const";
import type { ReviewInput, ReviewMessage as ReviewMessageRow } from "../apis/types";

const MAX_CORRECTION = 4000;

/**
 * One turn of a widget conversation, and — for a reply — the three things a counsellor can say
 * about it.
 *
 * What each does is spelled out rather than left to the verb, because the consequences differ
 * sharply: approving reinforces the guidance the reply followed, flagging votes against it, and
 * only a correction creates something new. Someone clicking "Approve" to clear a queue should
 * know they are casting a vote.
 */
export function ReviewMessageRowView({
  message, onReview, busy,
}: Readonly<{
  message: ReviewMessageRow;
  onReview: (messageId: number, review: ReviewInput) => Promise<boolean>;
  busy: boolean;
}>) {
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[85%] rounded-lg rounded-br-sm bg-primary/10 px-3 py-2 text-sm">{message.content}</div>
        <span className="text-[11px] text-muted-foreground">{relativeTime(message.created_at)}</span>
      </div>
    );
  }

  const reviewed = message.review_status;
  const submit = async (review: ReviewInput) => {
    setError(null);
    const ok = await onReview(message.id, review);
    if (!ok) return setError("That didn't save. Try again.");
    setCorrecting(false);
    setCorrection("");
    setNote("");
  };

  const saveCorrection = () => {
    const trimmed = correction.trim();
    if (!trimmed) return setError("Write what the reply should have said.");
    if (trimmed.length > MAX_CORRECTION) return setError("That's too long for one correction.");
    submit({ status: "corrected", correction: trimmed, note: note.trim() || undefined });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="max-w-[85%] rounded-lg rounded-bl-sm border bg-muted/40 px-3 py-2 text-sm">{message.content}</div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>{relativeTime(message.created_at)}</span>
        {message.feedback === "positive" && <ThumbsUp className="size-3 text-emerald-600" />}
        {message.feedback === "negative" && <ThumbsDown className="size-3 text-destructive" />}
        {message.memory_ids.length > 0 && (
          <span>
            followed {message.memory_ids.length} of your {message.memory_ids.length === 1 ? "rule" : "rules"}
          </span>
        )}
        {reviewed && (
          <Badge variant="outline" className="text-[11px]">{REVIEW_META[reviewed].label}</Badge>
        )}
      </div>

      {message.correction && (
        <div className="max-w-[85%] rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
          <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Your correction</p>
          <p className="mt-1 text-sm">{message.correction}</p>
          {message.review_note && <p className="mt-1 text-xs text-muted-foreground">{message.review_note}</p>}
        </div>
      )}

      {correcting ? (
        <div className="flex max-w-[85%] flex-col gap-2 rounded-lg border p-3">
          <Textarea
            rows={3}
            value={correction}
            maxLength={MAX_CORRECTION}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="What should it have said?"
          />
          <Textarea
            rows={2}
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why, in your own words (optional) — this is what the rule is drawn from."
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={saveCorrection} disabled={busy}>Save correction</Button>
            <Button size="sm" variant="ghost" onClick={() => { setCorrecting(false); setError(null); }} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className={cn("flex flex-wrap items-center gap-1.5", reviewed && "opacity-70")}>
          <Button size="sm" variant="outline" onClick={() => submit({ status: "approved" })} disabled={busy}>
            <Check className="size-3.5" /> Good answer
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCorrecting(true)} disabled={busy}>
            <PencilLine className="size-3.5" /> Correct it
          </Button>
          <Button size="sm" variant="ghost" onClick={() => submit({ status: "flagged" })} disabled={busy}>
            <Flag className="size-3.5" /> Wrong
          </Button>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      )}
    </div>
  );
}
