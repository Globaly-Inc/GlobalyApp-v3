"use client";

import { useEffect, useState } from "react";
import { Expand, Minus, Shrink } from "lucide-react";
import { AlyOrbIcon } from "@/components/aly-orb-icon";
import { Button } from "@/components/ui/button";
import { CLOSE_MESSAGE, EXPAND_MESSAGE, READY_MESSAGE } from "../const";

/**
 * Identity on the left (always Aly, in the widget's brand colour), then the panel controls.
 * The controls only exist inside the host site's iframe: "expand"/"collapse", which grows the panel
 * over the host page and back, and "close", which puts it away. Both ask public/embed.js on the
 * host page — the iframe can't resize or hide itself.
 */
export function WidgetHeader({
  name,
  subtitle,
  brandColor,
  framed,
}: Readonly<{
  name: string;
  subtitle: string;
  brandColor?: string | null;
  framed: boolean;
}>) {
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    window.parent.postMessage({ type: EXPAND_MESSAGE, expanded: next }, "*");
  };

  // The close control below now exists; embed.js may hide its launcher on mobile. On unmount (a
  // crash swaps this tree for an error page) it's gone again, so the launcher must come back.
  useEffect(() => {
    if (!framed) return;
    window.parent.postMessage({ type: READY_MESSAGE, ready: true }, "*");
    return () => window.parent.postMessage({ type: READY_MESSAGE, ready: false }, "*");
  }, [framed]);

  // Floating: the brand owns the header surface (staging's design) — --primary is the brand and
  // --primary-foreground its measured readable ink (widgetTheme.onAccent), so any hex is legible.
  // Expanded: a plain white bar over the page, like a dialog, with a labelled way back out.
  const ctrl = expanded
    ? "text-muted-foreground hover:bg-muted hover:text-foreground"
    : "text-primary-foreground hover:bg-white/15 hover:text-primary-foreground";

  return (
    <header
      className={
        expanded
          ? "flex shrink-0 items-center gap-3 border-b bg-background px-5 py-3 text-foreground"
          : "flex shrink-0 items-center gap-2.5 bg-primary px-4 py-3 text-primary-foreground"
      }
    >
      {/* Aly sits on a white disc so a brand-tinted orb never vanishes into its own colour. */}
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ${
          expanded ? "size-12 ring-2 ring-primary/20" : "size-10"
        }`}
      >
        <AlyOrbIcon className={expanded ? "size-11" : "size-9"} color={brandColor} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className={`truncate text-xs ${expanded ? "text-muted-foreground" : "opacity-80"}`}>{subtitle}</p>
      </div>
      {framed && (
        <>
          {expanded ? (
            <Button variant="ghost" size="sm" className={ctrl} onClick={toggleExpanded}>
              <Shrink className="h-4 w-4" />
              Exit full screen
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              className={ctrl}
              aria-label="Expand chat"
              title="Full screen"
              onClick={toggleExpanded}
            >
              <Expand className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className={ctrl}
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
