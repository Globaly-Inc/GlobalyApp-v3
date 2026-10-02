"use client";

import { Expand, Minus } from "lucide-react";
import { AlyOrbIcon } from "@/components/aly-orb-icon";
import { Button } from "@/components/ui/button";
import { CLOSE_MESSAGE } from "../const";

/**
 * Identity on the left (always Aly, in the widget's brand colour), then the panel controls.
 * The controls only exist inside the host site's iframe: "open in a new tab" and "close", which
 * asks public/embed.js on the host page to put the panel away — the iframe can't hide itself.
 */
export function WidgetHeader({
  embedKey,
  name,
  subtitle,
  brandColor,
  framed,
  fingerprint,
}: Readonly<{
  embedKey: string;
  name: string;
  subtitle: string;
  brandColor?: string | null;
  framed: boolean;
  fingerprint: string;
}>) {
  return (
    // The brand owns the header surface (staging's design): --primary is the brand and
    // --primary-foreground its measured readable ink (widgetTheme.onAccent), so any hex is legible.
    // Aly sits on a white disc so a brand-tinted orb never vanishes into its own colour.
    <header className="flex shrink-0 items-center gap-2.5 bg-primary px-4 py-3 text-primary-foreground">
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
        <AlyOrbIcon className="size-7" color={brandColor} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs opacity-80">{subtitle}</p>
      </div>
      {framed && (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
            aria-label="Open in a new tab"
            title="Open in a new tab"
            render={<a href={`/embed/${encodeURIComponent(embedKey)}#fp=${encodeURIComponent(fingerprint)}`} target="_blank" rel="noreferrer" />}
          >
            <Expand className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
            aria-label="Close chat"
            title="Close"
            // The host page's origin is unknown here (any partner site); embed.js checks that the
            // message came from its own panel, so "*" leaks nothing but this one word.
            onClick={() => window.parent.postMessage({ type: CLOSE_MESSAGE }, "*")}
          >
            <Minus className="h-4 w-4" />
          </Button>
        </>
      )}
    </header>
  );
}
