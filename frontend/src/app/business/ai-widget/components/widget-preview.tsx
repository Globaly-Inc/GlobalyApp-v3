"use client";

import { useState } from "react";
import { ArrowUp, ChevronDown, Expand, Lock, Minus, Sparkles } from "lucide-react";
import { AlyOrbIcon } from "@/components/aly-orb-icon";
import { cn } from "@/lib/utils";
import { embedStarters, type EmbedOwnerKind } from "@/app/embed/[key]/const";
import { widgetTheme } from "@/app/embed/[key]/utils";
import type { WidgetFormValues } from "./widget-form";
import { radioGroupKeyDown } from "../utils";

/**
 * The widget as a visitor will see it, redrawn from the form on every keystroke. A static copy of
 * the real panel (embed/[key]), themed by the same `widgetTheme`, on a sketch of a website, so the
 * corner, the colour and the copy can be judged before saving. The real thing is one click away
 * under "Test on a sample page". Open/Closed shows both states a visitor meets.
 */
export function WidgetPreview({ form, ownerKind }: Readonly<{ form: WidgetFormValues; ownerKind: EmbedOwnerKind }>) {
  const theme = widgetTheme(form.brand_color);
  const [category] = embedStarters(ownerKind);
  const left = form.position === "left";
  const [open, setOpen] = useState(true);

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-2xl border bg-card">
      {/* Browser chrome, so the panel reads as sitting on someone's website. */}
      <div className="flex items-center gap-3 border-b px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-red-400" />
          <span className="size-2.5 rounded-full bg-amber-400" />
          <span className="size-2.5 rounded-full bg-emerald-400" />
        </span>
        <span className="flex flex-1 items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3" aria-hidden /> yourwebsite.com
        </span>
        <div role="radiogroup" aria-label="Preview state" className="inline-flex rounded-lg bg-muted p-0.5" onKeyDown={radioGroupKeyDown}>
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={open === v}
              tabIndex={open === v ? 0 : -1}
              onClick={() => setOpen(v)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                open === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v ? "Open" : "Closed"}
            </button>
          ))}
        </div>
      </div>

    <div className="relative h-[660px] overflow-hidden bg-muted/30 xl:h-auto xl:min-h-0 xl:flex-1">
      {/* A sketch of the institution's site. */}
      <div className="flex flex-col gap-5 p-6" aria-hidden>
        <div className="flex justify-between">
          <div className="h-3 w-32 rounded-full bg-muted-foreground/20" />
          <div className="flex gap-3">
            <div className="h-2 w-12 rounded-full bg-muted-foreground/15" />
            <div className="h-2 w-12 rounded-full bg-muted-foreground/15" />
            <div className="h-2 w-12 rounded-full bg-muted-foreground/15" />
          </div>
        </div>
        <div className="flex h-40 flex-col justify-center gap-3 rounded-xl bg-muted-foreground/10 p-6">
          <div className="h-4 w-2/5 rounded-full bg-muted-foreground/20" />
          <div className="h-2.5 w-3/5 rounded-full bg-muted-foreground/15" />
          <div className="mt-2 h-6 w-24 rounded-lg bg-muted-foreground/20" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border bg-background p-3">
              <div className="h-14 rounded-lg bg-muted" />
              <div className="h-2 w-4/5 rounded-full bg-muted-foreground/15" />
              <div className="h-2 w-1/2 rounded-full bg-muted-foreground/15" />
            </div>
          ))}
        </div>
      </div>

      {open && (
      <div
        data-widget-brand
        style={theme.vars}
        className={cn(
          "absolute bottom-24 flex h-[500px] max-h-[calc(100%-7rem)] w-[340px] max-w-[calc(100%-2.5rem)] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl",
          left ? "left-5" : "right-5",
        )}
      >
        {/* Same surface as the real header: the brand fill with its measured readable ink. */}
        <div className="flex items-center gap-2 bg-primary px-3 py-2.5 text-primary-foreground">
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
            <AlyOrbIcon className="size-9" color={form.brand_color} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{form.display_name || "AI Counsellor"}</p>
            <p className="truncate text-[10px] opacity-80">{form.subtitle || "AI counsellor"}</p>
          </div>
          <Expand className="size-3.5 opacity-80" aria-hidden />
          <Minus className="size-3.5 opacity-80" aria-hidden />
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-hidden px-4 py-5" style={{ background: theme.heroBackground }}>
          {form.greeting && <p className="text-center text-xs text-muted-foreground">{form.greeting}</p>}
          <p className="flex items-center justify-center gap-1.5 text-center text-base font-semibold">
            <Sparkles className="size-4 text-primary" aria-hidden />
            <span className="gradient-text">How can I help you today?</span>
          </p>
          {category && (
            <>
              <div className="flex flex-wrap justify-center gap-1.5">
                {embedStarters(ownerKind).map((c, i) => (
                  <span
                    key={c.label}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px]",
                      i === 0 ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                    )}
                  >
                    {c.label}
                  </span>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                {category.questions.slice(0, 3).map((q) => (
                  <span key={q} className="rounded-lg border bg-card px-3 py-2 text-[11px]">{q}</span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="px-3 pt-2">
          <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 shadow-sm">
            <span className="flex-1 text-[11px] text-muted-foreground">How can I help you today?</span>
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ArrowUp className="size-3.5" aria-hidden />
            </span>
          </div>
          <p className="py-1.5 text-center text-[9px] text-muted-foreground">Powered by Globaly · AI can make mistakes</p>
        </div>
      </div>
      )}

      {/* The launcher, in the corner the visitor will find it: Aly when closed, a chevron when open. */}
      <span
        data-widget-brand
        className={cn(
          "absolute bottom-5 flex size-14 items-center justify-center overflow-hidden rounded-full",
          open ? "bg-primary text-primary-foreground" : "bg-white",
          left ? "left-5" : "right-5",
        )}
        style={{ ...theme.vars, boxShadow: `0 8px 24px ${theme.soft.replace("0.08", "0.45")}` }}
        aria-hidden
      >
        {open ? <ChevronDown className="size-6" /> : <AlyOrbIcon className="size-14" color={form.brand_color} />}
      </span>
    </div>
    </div>
  );
}
