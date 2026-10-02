"use client";

import { useEffect, useRef } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchConversionInsights } from "../store/ai-knowledge-insights-slice";
import { TOPIC_LABEL } from "../const";
import { InsightBars } from "./insight-bars";
import { ConversionHero } from "./conversion-hero";

const topic = (value: string) => TOPIC_LABEL[value] ?? value;

/** Seconds as something a person reads. "7 min", not "412". */
function duration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 90) return `${seconds} sec`;
  const mins = Math.round(seconds / 60);
  if (mins < 90) return `${mins} min`;
  return `${Math.round(mins / 60)} hr`;
}

export function InsightsTab() {
  const dispatch = useAppDispatch();
  const { insights, status, error } = useAppSelector((s) => s.aiKnowledgeInsights);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchConversionInsights());
  }, [dispatch]);

  if (status === "loading" && !insights) {
    return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-primary" /></div>;
  }
  if (status === "failed" || !insights) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        {error ?? "Couldn't load conversion insights."}
      </div>
    );
  }

  // A brand-new widget has no finished conversations, and that is the normal first state rather
  // than an error — say what will fill it instead of showing a grid of zeros.
  if (insights.conversations === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <TrendingUp className="size-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">No finished conversations yet</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Once visitors have had a few conversations with your widget, this shows which routes
          through them end with someone sharing their details — and which end without.
        </p>
      </div>
    );
  }

  const { conversations, converted, volunteered, prompted } = insights;

  return (
    <div className="flex flex-col gap-4">
      <ConversionHero
        conversations={conversations}
        converted={converted}
        messages={insights.median_messages_to_conversion}
        duration={duration(insights.median_seconds_to_conversion)}
      />

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">How they shared their details</h2>
        <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
          Whether your counsellor had asked. These two split the same {converted} leads between
          them and add up to it — not two different measures.
        </p>
        <InsightBars
          emptyLabel="No leads yet."
          rows={[
            { key: "volunteered", label: "Offered without being asked", count: volunteered,
              title: "The contact card was never shown to this visitor — they gave their details unprompted." },
            { key: "prompted", label: "After your counsellor asked", count: prompted,
              title: "The contact card had been shown at least once, however the details finally arrived." },
          ]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold">What they asked about last</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            The subject on the table when someone shared their details.
          </p>
          <InsightBars
            emptyLabel="No leads yet."
            rows={insights.topic_before_conversion.map((r) => ({ key: r.value, label: topic(r.value), count: r.count }))}
          />
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold">What they opened with</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            Across every conversation, converted or not.
          </p>
          <InsightBars
            emptyLabel="Nothing yet."
            rows={insights.first_topic.map((r) => ({ key: r.value, label: topic(r.value), count: r.count }))}
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">Routes that ended in a lead</h2>
        <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
          The order subjects came up in, for conversations that produced one.
        </p>
        <InsightBars
          emptyLabel="No leads yet."
          rows={insights.top_paths.map((p) => ({
            key: p.path.join(">") || "empty",
            count: p.count,
            title: p.path.map(topic).join(" → "),
            label: (
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                {p.path.map((step, i) => (
                  <span key={`${step}-${i}`} className="flex items-center gap-1.5">
                    {i > 0 && <span aria-hidden className="text-muted-foreground/50">→</span>}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{topic(step)}</span>
                  </span>
                ))}
              </span>
            ),
          }))}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Counted per conversation, never per person: a visitor who clears their browser starts a new
        one. These figures show the shape of the funnel, not a headcount.
      </p>
    </div>
  );
}
