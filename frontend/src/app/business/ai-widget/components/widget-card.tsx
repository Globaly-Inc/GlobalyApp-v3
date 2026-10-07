"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, KeyRound } from "lucide-react";
import { WidgetSwitch } from "@/app/business/messages/components/widget-switch";
import { AlyOrbIcon } from "@/components/aly-orb-icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EmbedConfig } from "../apis/types";

// One script tag, not a raw iframe: public/embed.js renders the floating orb and only
// loads the chat panel once a visitor opens it, so the host page doesn't have to find room
// for a 420x640 block — or pay for a session nobody asked for.
export function embedSnippet(embedKey: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `<script src="${origin}/embed.js" data-key="${embedKey}" async></script>`;
}

/** Yes/No inline confirm, used for the action that breaks a live embed. */
function Confirm({ label, onYes, onNo }: Readonly<{ label: string; onYes: () => void; onNo: () => void }>) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Button size="sm" variant="destructive" onClick={onYes}>Yes</Button>
      <Button size="sm" variant="outline" onClick={onNo}>No</Button>
    </div>
  );
}

export function WidgetCard({
  config,
  onEdit,
  onRotateKey,
}: Readonly<{
  config: EmbedConfig;
  /** Absent when the editor is on the same page. */
  onEdit?: (config: EmbedConfig) => void;
  onRotateKey: (id: number) => void;
}>) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(embedSnippet(config.embed_key));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="@container overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:flex-nowrap">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-primary/20">
            <AlyOrbIcon className="size-11" color={config.brand_color} />
          </span>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <span className="truncate">{config.display_name ?? "Untitled widget"}</span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-sans text-xs font-medium",
                  config.is_active ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground",
                )}
              >
                <span className={cn("size-1.5 rounded-full", config.is_active ? "bg-emerald-500" : "bg-muted-foreground")} />
                {config.is_active ? "Live" : "Paused"}
              </span>
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              {config.subtitle || "AI counsellor · powered by Globaly"}
            </p>
          </div>
        </div>

        {confirming ? (
          <Confirm
            label="Old snippet stops working. Continue?"
            onYes={() => { onRotateKey(config.id); setConfirming(false); }}
            onNo={() => setConfirming(false)}
          />
        ) : (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
            <Link
              href={`/business/ai-widget/preview/${config.embed_key}`}
              target="_blank"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <ExternalLink className="size-3.5" aria-hidden />
              {/* Labels shorten in a narrow card so the actions stay on the name's row. */}
              <span className="@4xl:hidden">Test page</span>
              <span className="hidden @4xl:inline">Test on a sample page</span>
            </Link>
            {onEdit && (
              <Button size="sm" variant="ghost" onClick={() => onEdit(config)}>Appearance</Button>
            )}
            <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" aria-label="Regenerate key" title="Regenerate key" onClick={() => setConfirming(true)}>
              <KeyRound className="size-3.5" aria-hidden />
              <span className="hidden @4xl:inline">Regenerate key</span>
            </Button>
            {/* The same switch as above the Inbox: off asks nothing, and offers Undo instead. */}
            <WidgetSwitch />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 px-5 py-4">
        <p className="text-sm font-medium">
          Add it to your website
          <span className="font-normal text-xs text-muted-foreground">
            {" · "}Paste this tag just before <code className="rounded bg-muted px-1 py-0.5">&lt;/body&gt;</code> on every page
            where the counsellor should appear.
          </span>
        </p>
        <div className="flex items-center gap-2 rounded-xl bg-neutral-950 py-2 pr-2 pl-4">
          <code title={embedSnippet(config.embed_key)} className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-100">
            {embedSnippet(config.embed_key)}
          </code>
          <Button
            size="sm"
            variant="ghost"
            onClick={copy}
            className="shrink-0 gap-1.5 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </section>
  );
}
