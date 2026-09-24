"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { EmbedEndPrompt } from "../apis";

type ConversationEndCardProps = {
  prompt: EmbedEndPrompt;
  onEnd: () => Promise<boolean>;
  onContinue: () => void;
};

/**
 * The counsellor's clause about what was covered, as one finished sentence.
 *
 * The prompt asks for a lowercase fragment ("we've covered the fees and the intake") so it could
 * be slotted after a prepended "I think ". Models do not reliably comply — one returned "We have
 * covered our Master of Engineering..." with its own capital and full stop, which rendered as
 * "I think We have covered ... details.. I can email you". Two visible defects from one seam.
 *
 * So the seam is gone: whatever the model writes stands on its own, and this only guarantees a
 * single terminal stop. Nothing here re-cases the text — lowercasing the first word would corrupt
 * a clause that legitimately opens on a proper noun ("Cornell Tech and admissions are covered").
 */
function asSentence(covered: string): string {
  const trimmed = covered.trim().replace(/[.\s]+$/, "");
  return trimmed ? `${trimmed}. ` : "";
}

/**
 * The offer to wrap up and be emailed a summary.
 *
 * Shown because the counsellor judged the visitor's enquiry answered — not because a timer
 * expired — and `prompt.reason` is its own words for what was covered, which is what keeps this
 * reading as the end of a conversation rather than an interruption of one.
 *
 * Nothing here blocks the chat: the composer stays live behind it, and sending another message
 * is treated as "continue" by the server without the visitor having to say so.
 */
export function ConversationEndCard({ prompt, onEnd, onContinue }: ConversationEndCardProps) {
  const [status, setStatus] = useState<"idle" | "ending" | "ended">("idle");
  const [queued, setQueued] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const handleEnd = async () => {
    setStatus("ending");
    setFailed(null);
    try {
      setQueued(await onEnd());
      setStatus("ended");
    } catch (e) {
      setFailed((e as Error).message);
      setStatus("idle");
    }
  };

  if (status === "ended") {
    return (
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <p className="mb-0.5 text-sm font-semibold">Thanks for chatting!</p>
        <p className="text-xs text-muted-foreground">
          {/* Only promise the email when the server confirmed one is actually queued — a
              visitor who never gave an address must not be told it is on its way. */}
          {queued && prompt.email ? (
            <>
              A summary of everything we discussed is on its way to{" "}
              <span className="font-medium text-foreground">{prompt.email}</span>. Ask me anything
              else whenever you like.
            </>
          ) : (
            <>Ask me anything else whenever you like.</>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="mb-0.5 text-sm font-semibold">{prompt.heading}</p>
      <p className="mb-3 text-xs text-muted-foreground">
        {prompt.covered ? asSentence(prompt.covered) : ""}
        {prompt.body}
      </p>

      {failed && <p className="mb-2 text-xs text-destructive">{failed}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="sm" className="flex-1" onClick={handleEnd} disabled={status === "ending"}>
          {status === "ending" ? "Sending…" : "End chat & send summary"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onContinue} disabled={status === "ending"}>
          Continue chatting
        </Button>
      </div>
    </div>
  );
}
