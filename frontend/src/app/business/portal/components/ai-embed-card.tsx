"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ensureEmbedConfig } from "@/app/business/ai-widget/store/ai-widget-slice";
import { EmbedDeveloperHandoff } from "./embed-developer-handoff";
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
export function AiEmbedCard({
  orgName,
  installed,
}: Readonly<{ orgName: string; installed: boolean }>) {
  const dispatch = useAppDispatch();
  const handoff = useAppSelector((s) => s.aiWidget.handoff);
  const status = useAppSelector((s) => s.aiWidget.handoffStatus);
  const [copied, setCopied] = useState(false);

  // Strict mode double-invokes effects; without this the org's widget is minted twice on mount.
  const ensuredRef = useRef(false);
  useEffect(() => {
    if (ensuredRef.current) return;
    ensuredRef.current = true;
    dispatch(ensureEmbedConfig());
  }, [dispatch]);

  const copy = async () => {
    if (!handoff) return;
    try {
      await navigator.clipboard.writeText(handoff.snippet);
      setCopied(true);
      toast.success("Code copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some embedded and insecure contexts — the code is on screen and
      // selectable, so say that rather than failing silently.
      toast.error("Couldn't copy", { description: "Select the code and copy it manually." });
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <MessagesSquare className="h-4.5 w-4.5" />
          </span>
          <div className="space-y-1">
            <h2 className="text-balance text-sm font-semibold">Your AI chat widget</h2>
            <p className="text-pretty text-sm text-muted-foreground">
              Answers visitors&apos; questions around the clock, in your own branding. Already created —
              it just needs to go on your site.
            </p>
          </div>
        </div>

        {/* Only the positive state is worth a badge. Shape as well as colour, so the meaning is
            never carried by hue alone. */}
        {installed && (
          <span
            role="status"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-600/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            Live on your site
          </span>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
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
                  {/* Selectable, never behind a reveal: this tag ships in the page source of their
                      own public website, so masking it would be theatre that costs a click. */}
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3 sm:flex-row sm:items-center">
                    <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-xs leading-5 text-foreground">
                      {handoff.snippet}
                    </code>
                    <Button variant="outline" size="sm" onClick={copy} className="shrink-0 cursor-pointer">
                      {copied
                        ? <Check className="mr-1.5 h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                        : <Copy className="mr-1.5 h-4 w-4" aria-hidden />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  {/* Once, in the shared layout — not per page. Every platform these customers use
                      has a single site-wide slot, and per-page pasting is how a widget ends up on
                      three pages out of forty. The developer email spells out where, per platform. */}
                  <p className="text-xs text-muted-foreground">
                    Add it <strong className="font-medium text-foreground">once</strong>, in the file every page
                    already shares — your root layout, theme footer, or your platform&apos;s site-wide code
                    setting. Pasting it twice is safe.
                  </p>
                </Step>

                <Step n={2} title="Or let your developer do it">
                  <EmbedDeveloperHandoff developer={handoff.developer} orgName={orgName} />
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
              className="inline-flex items-center text-xs font-medium text-primary hover:underline"
            >
              Change its name, greeting and colour
              <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
