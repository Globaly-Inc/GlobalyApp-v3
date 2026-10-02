"use client";

import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/hooks";
import { createMemory } from "../store/ai-knowledge-slice";
import { TOPIC_LABEL, TRANSITION_SCAN_LIMIT } from "../const";
import type { TopicTransition } from "../apis/types";

const topic = (value: string) => TOPIC_LABEL[value] ?? value;

/**
 * Mined steps — "visitors who asked about X went on to ask about Y" — each with a button that
 * stores it as a guideline.
 *
 * There is no bar here, deliberately, even though every other panel on this tab has one. Each
 * row carries TWO numbers that mean different things (how many visitors did this, and how many
 * of them became a lead), and a single-series bar can only honestly draw one of them. The
 * conversion share is the number someone decides on, so it is the one given the prominence;
 * support is the sample size that says whether to believe it.
 */
export function TopicPatterns({
  transitions, conversations,
}: Readonly<{ transitions: TopicTransition[]; conversations: number }>) {
  const dispatch = useAppDispatch();
  // Keyed by step rather than one flag: two buttons pressed in a row must not both spin, and a
  // stored step must stay marked while its neighbour is still saving.
  const [busy, setBusy] = useState<string | null>(null);
  const [stored, setStored] = useState<ReadonlySet<string>>(new Set());

  const teach = async (t: TopicTransition) => {
    const key = `${t.from}>${t.to}`;
    setBusy(key);
    // The suggestion text is composed and length-checked by the backend, so this posts it
    // verbatim. COUNSELLING_GUIDELINE because a transition is advice about ORDER — it states
    // nothing about fees or visas themselves, and the types that may state a fact are not
    // something a button should reach for.
    const result = await dispatch(createMemory({ type: "COUNSELLING_GUIDELINE", content: t.suggestion }));
    setBusy(null);
    // Lands as an ordinary admin memory in "What it knows", where it can be edited or retired
    // like any other. Nothing here needs to re-read the list: this tab does not show memories.
    if (createMemory.fulfilled.match(result)) setStored((prev) => new Set(prev).add(key));
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold">What they ask next</h2>
      <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
        Steps that showed up across enough conversations to be more than coincidence, mined from{" "}
        {conversations > TRANSITION_SCAN_LIMIT
          ? `your ${TRANSITION_SCAN_LIMIT.toLocaleString()} most recent conversations`
          : `all ${conversations.toLocaleString()} of your conversations`}. Teaching one tells your
        counsellor to raise the second subject while the first is still on the table.
      </p>

      {!transitions.length ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Nothing repeats often enough yet. A step has to appear in at least three conversations
          before it shows here — two visitors doing the same thing is a coincidence.
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {transitions.map((t) => {
            const key = `${t.from}>${t.to}`;
            const share = Math.round((t.converted / t.support) * 100);
            const done = stored.has(key);
            return (
              <li key={key} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{topic(t.from)}</span>
                    <span aria-hidden className="text-muted-foreground/50">→</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{topic(t.to)}</span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t.support} conversations · {t.converted} became leads ({share}%)
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={done ? "ghost" : "outline"}
                  disabled={done || busy === key}
                  onClick={() => teach(t)}
                  title={t.suggestion}
                >
                  {busy === key ? <Loader2 className="size-3.5 animate-spin" />
                    : done ? <Check className="size-3.5" />
                    : <Plus className="size-3.5" />}
                  {done ? "Added" : "Teach this"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
