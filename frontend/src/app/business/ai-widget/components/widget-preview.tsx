"use client";

import { ArrowUp, Expand, Minus, Sparkles } from "lucide-react";
import { AlyOrbIcon } from "@/components/aly-orb-icon";
import { cn } from "@/lib/utils";
import { embedStarters, type EmbedOwnerKind } from "@/app/embed/[key]/const";
import { widgetTheme } from "@/app/embed/[key]/utils";
import type { WidgetFormValues } from "./widget-form";

/**
 * The widget as a visitor will see it, redrawn from the form on every keystroke. A static copy of
 * the real panel (embed/[key]), themed by the same `widgetTheme`, on a sketch of a website, so the
 * corner, the colour and the copy can be judged before saving. The real thing is one click away
 * under "Preview on a sample page".
 */
export function WidgetPreview({ form, ownerKind }: Readonly<{ form: WidgetFormValues; ownerKind: EmbedOwnerKind }>) {
  const theme = widgetTheme(form.brand_color);
  const [category] = embedStarters(ownerKind);
  const left = form.position === "left";

  return (
    <div className="relative h-[640px] overflow-hidden rounded-xl border bg-muted/40">
      {/* A sketch of the institution's site, so the panel reads as sitting on someone's page. */}
      <div className="flex flex-col gap-3 p-6" aria-hidden>
        <div className="h-3 w-32 rounded bg-muted-foreground/20" />
        <div className="h-24 rounded-lg bg-muted-foreground/10" />
        <div className="h-3 w-3/4 rounded bg-muted-foreground/15" />
        <div className="h-3 w-1/2 rounded bg-muted-foreground/15" />
      </div>

      <div
        data-widget-brand
        style={theme.vars}
        className={cn(
          "absolute bottom-20 flex h-[480px] w-[320px] flex-col overflow-hidden rounded-2xl border bg-background shadow-xl",
          left ? "left-4" : "right-4",
        )}
      >
        <div className="flex items-center gap-2 border-b border-t-[3px] border-t-primary px-3 py-2">
          <AlyOrbIcon className="size-6" color={form.brand_color} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{form.display_name || "AI Counsellor"}</p>
            <p className="truncate text-[10px] text-muted-foreground">{form.subtitle || "AI counsellor · powered by Globaly"}</p>
          </div>
          <Expand className="size-3.5 text-muted-foreground" aria-hidden />
          <Minus className="size-3.5 text-muted-foreground" aria-hidden />
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

        <div className="border-t px-3 pt-2">
          <div className="flex items-center gap-2 rounded-xl border px-3 py-2">
            <span className="flex-1 text-[11px] text-muted-foreground">How can I help you today?</span>
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ArrowUp className="size-3.5" aria-hidden />
            </span>
          </div>
          <p className="py-1.5 text-center text-[9px] text-muted-foreground">Powered by Globaly · AI can make mistakes</p>
        </div>
      </div>

      {/* The launcher, in the corner the visitor will find it. */}
      <span
        className={cn(
          "absolute bottom-4 flex size-12 items-center justify-center overflow-hidden rounded-full bg-white",
          left ? "left-4" : "right-4",
        )}
        style={{ boxShadow: `0 8px 24px ${theme.soft.replace("0.08", "0.45")}` }}
        aria-hidden
      >
        <AlyOrbIcon className="size-12" color={form.brand_color} />
      </span>
    </div>
  );
}
