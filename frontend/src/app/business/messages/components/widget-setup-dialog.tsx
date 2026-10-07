"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, MessageSquare } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAppSelector } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { WIDGET_SETTINGS_HREF } from "@/app/business/ai-widget/const";

/** A placeholder line in the illustration — shapes only, never text a visitor could have sent. */
function Bar({ className }: Readonly<{ className: string }>) {
  return <span className={cn("block h-1.5 rounded-full", className)} />;
}

/** A website with the AI Embed open on it: a browser frame, page skeleton, chat panel and launcher. */
function WidgetIllustration() {
  return (
    <div
      aria-hidden
      className="relative h-56 overflow-hidden border-b border-border bg-secondary bg-[radial-gradient(hsl(215_16%_85%)_1px,transparent_1px)] [background-size:16px_16px] sm:h-64"
    >
      <div className="absolute left-6 top-8 w-[72%] overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-primary/10 sm:left-10">
        <div className="flex h-7 items-center gap-1.5 border-b border-border bg-muted px-3">
          {[0, 1, 2].map((i) => <span key={i} className="size-2 rounded-full bg-border" />)}
          <span className="ml-2 flex h-3.5 flex-1 items-center rounded-full border border-border bg-card px-2 text-[9px] text-muted-foreground">
            your-website.com
          </span>
        </div>
        <div className="flex flex-col gap-2.5 px-5 pb-16 pt-4">
          <div className="flex items-center gap-2">
            <span className="size-5 rounded-md bg-primary/85" />
            <Bar className="w-16 bg-muted-foreground/15" />
          </div>
          <Bar className="mt-3 h-3 w-1/2 bg-muted-foreground/20" />
          <Bar className="h-3 w-2/5 bg-muted-foreground/20" />
          <Bar className="mt-1 w-3/5 bg-muted-foreground/10" />
          <Bar className="w-1/2 bg-muted-foreground/10" />
          <span className="mt-1 h-5 w-20 rounded-md bg-primary/90" />
        </div>
      </div>

      <div className="absolute right-6 top-5 w-44 overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-primary/20 sm:right-10 sm:w-48">
        <div className="flex items-center gap-2 bg-primary px-3 py-2.5">
          <span className="flex size-6 items-center justify-center rounded-full bg-white/20 text-primary-foreground">
            <Bot className="size-3.5" />
          </span>
          <span className="flex flex-col gap-1">
            <Bar className="w-16 bg-white/85" />
            <Bar className="h-1 w-10 bg-white/45" />
          </span>
        </div>
        <div className="flex flex-col gap-2 p-3">
          <div className="flex w-fit flex-col gap-1 self-start rounded-xl rounded-bl-sm bg-primary/10 p-2">
            <Bar className="h-1 w-28 bg-primary/30" />
            <Bar className="h-1 w-20 bg-primary/30" />
          </div>
          <div className="w-fit self-end rounded-xl rounded-br-sm bg-muted p-2">
            <Bar className="h-1 w-16 bg-muted-foreground/30" />
          </div>
          <div className="flex w-fit flex-col gap-1 self-start rounded-xl rounded-bl-sm bg-primary/10 p-2">
            <Bar className="h-1 w-24 bg-primary/30" />
            <Bar className="h-1 w-28 bg-primary/30" />
            <Bar className="h-1 w-14 bg-primary/30" />
          </div>
          <div className="mt-0.5 flex h-6 items-center justify-between rounded-lg border border-border px-2">
            <Bar className="h-1 w-14 bg-border" />
            <span className="size-4 rounded bg-primary" />
          </div>
        </div>
      </div>

      <span className="absolute bottom-4 right-6 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 sm:right-10">
        <MessageSquare className="size-[18px]" />
      </span>
      <span className="absolute inset-x-0 bottom-0 h-[3px] bg-[hsl(var(--gold))]" />
    </div>
  );
}

/** Per org, so dismissing it for one campus doesn't hide it for another the same person manages. */
const dismissKey = (orgId: string) => `ai-widget-setup-dismissed:${orgId}`;

function readDismissed(orgId: string): boolean {
  try {
    return sessionStorage.getItem(dismissKey(orgId)) === "1";
  } catch {
    return false; // storage blocked (private window, previews): just show it
  }
}

/**
 * Shown over the Inbox while the org has no AI Embed widget. X, "Maybe later", Escape and an
 * outside click all dismiss it for the rest of the browser session (sessionStorage), so it doesn't
 * reappear on every visit to the Inbox but does come back next session. It goes away for good
 * once a widget exists, since `configs` is what decides it.
 *
 * Waits for `loaded`: before the first fetch answers, an empty `configs` means "not asked yet",
 * and showing the modal then would flash it at every org that does have a widget. That also keeps
 * the sessionStorage read off the server render — `loaded` is never true there.
 */
export function WidgetSetupDialog() {
  const orgId = useAuthState().user?.orgId ?? "";
  const needsWidget = useAppSelector((s) => s.aiWidget.loaded && s.aiWidget.configs.length === 0);
  // Bumped on dismiss so the read below runs again; the stored flag is the source of truth.
  const [, setDismissedAt] = useState(0);
  const open = needsWidget && !readDismissed(orgId);

  const dismiss = () => {
    try {
      sessionStorage.setItem(dismissKey(orgId), "1");
    } catch {
      // storage blocked: it stays closed until the next reload, which is the best we can do
    }
    setDismissedAt(Date.now());
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) dismiss(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[560px] gap-0 overflow-hidden rounded-2xl p-0">
        <WidgetIllustration />
        <div className="px-6 pb-2 pt-6 sm:px-7">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 text-xs font-semibold text-primary">
            <Bot className="size-3.5" aria-hidden /> AI Embed
          </span>
          <DialogTitle className="mt-3 font-heading text-2xl font-bold leading-tight">Configure your AI Embed widget</DialogTitle>
          <DialogDescription className="mt-2 leading-relaxed">
            Your AI Embed conversations will appear here once you configure and add a widget to your website. Set up your widget to start
            engaging with visitors and manage their conversations from this inbox.
          </DialogDescription>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-6 pt-4 sm:px-7">
          <Button variant="outline" className="h-10 px-4" onClick={dismiss}>Maybe later</Button>
          <Link href={WIDGET_SETTINGS_HREF} className={cn(buttonVariants(), "h-10 gap-2 px-4")}>
            Configure Widget <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
