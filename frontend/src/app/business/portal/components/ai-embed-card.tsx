"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Check, MessagesSquare } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ensureEmbedConfig } from "@/app/business/ai-widget/store/ai-widget-slice";
import { cn } from "@/lib/utils";
import type { PortalStage } from "./portal-hero";
import { EmbedDeveloperHandoff } from "./embed-developer-handoff";
import { EmbedSnippetBox } from "./embed-snippet-box";
import { EmbedWidgetPreview } from "./embed-widget-preview";

const COLUMNS = "lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]";

/** A numbered section. The two routes onto a site, not a pending to-do list — so the discs read
 *  the same whether or not the widget is already live. */
function Step({ n, title, children }: Readonly<{ n: number; title: string; children: React.ReactNode }>) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold">
        <span
          aria-hidden
          className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground"
        >
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * The org's AI chat widget on the portal home: what it looks like, the line that installs it, and a
 * way to get that line to whoever actually pastes it.
 *
 * The widget is minted by the first load of this card rather than by a "create" button — an org
 * that has just onboarded has nothing to configure yet, and a key with default appearance is
 * already installable.
 *
 * `installed` (the `add_chat_widget` onboarding step, which needs a real visitor rather than just a
 * config row) earns a confirmation badge when true and shows NOTHING when false. A permanent
 * "not installed yet" pill is a negative label on someone's own dashboard, and it is redundant:
 * a card full of installation instructions already says the thing is not installed.
 */
export function AiEmbedCard({ installed, stage = "built" }: Readonly<{ installed: boolean; stage?: PortalStage }>) {
  const dispatch = useAppDispatch();
  const handoff = useAppSelector((s) => s.aiWidget.handoff);
  const status = useAppSelector((s) => s.aiWidget.handoffStatus);
  // It answers from their own pages, so before those pages are read there is nothing worth
  // installing — the card says what it is waiting on instead of handing over a tag that would
  // answer nothing.
  const waiting = stage !== "built";
  // Board 11 names the assistant and says what it answers from — both are real: the name is the
  // widget's own display_name, the number is the crawl's course count. "A visitor last opened it
  // 6 minutes ago" is NOT built: nothing in the handoff or the analytics reports a last-seen time.
  const assistantName = handoff?.config.display_name?.trim();
  const courses = useAppSelector((s) => s.businessOnboarding.extractionStatus?.counts.courses ?? 0);

  // Strict mode double-invokes effects; without this the org's widget is minted twice on mount.
  const ensuredRef = useRef(false);
  useEffect(() => {
    if (ensuredRef.current || waiting) return;
    ensuredRef.current = true;
    dispatch(ensureEmbedConfig());
  }, [dispatch, waiting]);

  return (
    <Card className={cn(stage === "new" && "border-dashed bg-muted/20 shadow-none")}>
      <CardHeader className={cn("gap-3", waiting && "items-center pb-6")}>
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <MessagesSquare className="h-4.5 w-4.5" />
          </span>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-heading text-xl leading-tight font-semibold text-balance">
                {stage === "new"
                  ? "Your AI counsellor comes next"
                  : stage === "extracting"
                    ? "Your AI counsellor is being built"
                    : assistantName || "Your AI chat widget"}
              </h2>
              {installed && !waiting && (
                <span
                  role="status"
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-600/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Live on your site
                </span>
              )}
            </div>
            <p className="text-pretty text-sm text-muted-foreground">
              {stage === "new"
                ? "It answers students from your own pages, so it needs them first. Run the extraction above and the one line that puts it on your site appears here."
                : stage === "extracting"
                  ? "It learns from the pages we are reading right now. The one line that puts it on your site appears here as soon as the crawl finishes — nothing for you to do until then."
                  : courses > 0
                    ? `Answers students around the clock, in your own branding. It answers from all ${courses.toLocaleString()} courses.`
                    : "Answers visitors' questions around the clock, in your own branding. Already created — it just needs to go on your site."}
            </p>
          </div>
        </div>

        {/* Only the positive state is worth a badge. Shape as well as colour, so the meaning is
            never carried by hue alone. */}
        {/* Day one, the only thing to offer is the step this card waits on; mid-crawl, not even
            that — so the right-hand slot states the wait instead. */}
        {stage === "new" && (
          <CardAction>
          <a
            href="#extraction-card"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Start with my website
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </a>
          </CardAction>
        )}

        {stage === "extracting" && (
          <CardAction>
          <span
            role="status"
            className="flex h-[30px] shrink-0 items-center gap-[7px] rounded-full border border-primary/20 bg-primary/5 px-3 text-xs font-semibold text-primary"
          >
            <span aria-hidden className="size-[7px] rounded-full bg-[#23DDF6]" />
            Waiting on the crawl
          </span>
          </CardAction>
        )}

      </CardHeader>


      <CardContent className={cn("space-y-4", waiting && "hidden")} aria-hidden={waiting || undefined}>
        {/* Mirrors the loaded grid so nothing jumps when the config lands. */}
        {status === "loading" && !handoff && (
          <div className={`grid gap-5 ${COLUMNS} lg:items-start`}>
            <div className="space-y-4">
              <Skeleton className="h-[3.25rem] w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
            <Skeleton className="h-[12.5rem] w-full rounded-xl" />
          </div>
        )}

        {status === "failed" && !handoff && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-sm text-muted-foreground">We couldn&apos;t load your widget code.</p>
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={() => dispatch(ensureEmbedConfig())}
            >
              Try again
            </Button>
          </div>
        )}

        {handoff && (
          <>
            <div className={`grid gap-5 ${COLUMNS} lg:items-start`}>
              {/* The work is the subject and reads first; the preview is the reference beside it. */}
              <div className="space-y-5">
                <Step n={1} title="Paste it on your site yourself">
                  {/* Copy, or mail it to whoever installs it — the box owns both, so the code and
                      the ways of getting it out of here stay in one place. */}
                  <EmbedSnippetBox snippet={handoff.snippet} />
                  {/* Once, in the shared layout — not per page. Every platform these customers use
                      has a single site-wide slot, and per-page pasting is how a widget ends up on
                      three pages out of forty. The developer email spells out where, per platform. */}
                  <p className="text-xs text-muted-foreground">
                    Add it <strong className="font-medium text-foreground">once</strong>, in the file every page
                    already shares — your root layout, theme footer, or your platform&apos;s site-wide code
                    setting.
                  </p>
                </Step>

                <Step n={2} title="Or let your developer do it">
                  <EmbedDeveloperHandoff developers={handoff.developers} />
                </Step>
              </div>

              <figure className="space-y-2">
                <EmbedWidgetPreview config={handoff.config} />
                <figcaption className="text-center text-xs text-muted-foreground">
                  {installed ? "How visitors see it" : "How visitors will see it"}
                </figcaption>
              </figure>
            </div>

            <Link
              href="/business/ai-widget"
              className="inline-flex h-9 items-center rounded-lg border px-3.5 text-[13px] font-semibold transition-colors hover:bg-muted"
            >
              Change its look
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
