"use client";

import Image from "next/image";
import { MessageCircle } from "lucide-react";
import { AlyOrbIcon } from "@/components/aly-orb-icon";
import { widgetTheme } from "@/app/embed/[key]/utils";
import { DEFAULT_WIDGET_NAME } from "@/app/embed/[key]/const";
import type { EmbedConfig } from "@/app/business/ai-widget/apis";

/**
 * A miniature of the owner's actual widget, as a visitor would meet it.
 *
 * The card used to describe a thing it never showed — the owner's only way to see their own
 * assistant was the separate preview route. This renders their real `display_name`, `greeting` and
 * `brand_color` at dashboard scale, so "your AI chat widget" finally has a subject.
 *
 * Theme comes from the embed panel's own `widgetTheme`, not a second derivation: one place decides
 * what a brand colour means, including the measured foreground that keeps a pale brand legible.
 *
 * Deliberately inert — `pointer-events-none` over the whole mock, because a preview that looks
 * clickable and does nothing is worse than one that plainly does not.
 */
export function EmbedWidgetPreview({ config }: Readonly<{ config: EmbedConfig }>) {
  const theme = widgetTheme(config.brand_color);
  const name = config.display_name?.trim() || DEFAULT_WIDGET_NAME;
  const greeting = config.greeting?.trim() || "Hi! Ask me anything about studying with us.";

  return (
    <div
      role="img"
      aria-label={`Preview of your chat widget: ${name}, opening with “${greeting}”`}
      className="pointer-events-none relative select-none overflow-hidden rounded-xl border border-border bg-muted/30 p-4"
    >
      <div className="mx-auto w-full max-w-[13.5rem] overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        <div
          className="flex items-center gap-2 px-2.5 py-2"
          style={{ background: theme.accent, color: theme.onAccent }}
        >
          {config.logo_url ? (
            <Image src={config.logo_url} alt="" width={18} height={18} className="size-[18px] rounded" unoptimized />
          ) : (
            <AlyOrbIcon className="size-[18px]" />
          )}
          <span className="truncate text-[11px] font-semibold leading-none">{name}</span>
        </div>

        <div className="space-y-2 px-2.5 py-3">
          <p className="rounded-lg rounded-tl-sm bg-muted px-2 py-1.5 text-[10px] leading-snug text-foreground">
            {greeting}
          </p>
          <div className="flex flex-wrap gap-1">
            {["Fees", "Intakes"].map((chip) => (
              <span
                key={chip}
                className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                style={{ background: theme.soft, color: theme.accent }}
              >
                {chip}
              </span>
            ))}
          </div>
          <div className="rounded-full border border-border px-2 py-1 text-[9px] text-muted-foreground">
            Ask a question…
          </div>
        </div>
      </div>

      {/* The launcher, where a visitor actually meets it: bottom-right, brand-filled. */}
      <span
        className="absolute bottom-3 right-3 flex size-8 items-center justify-center rounded-full shadow-md"
        style={{ background: theme.accent, color: theme.onAccent }}
      >
        <MessageCircle className="size-4" aria-hidden />
      </span>
    </div>
  );
}
