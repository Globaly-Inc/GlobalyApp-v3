"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * The tag itself, with the one thing anyone does to it.
 *
 * Never behind a reveal — this tag ships in the page source of their own public website, so masking
 * it would be theatre that costs a click. Mailing it to someone lives in the developer handoff
 * below, next to the other way of getting it onto a site, rather than hiding in a menu up here.
 */
export function EmbedSnippetBox({ snippet }: Readonly<{ snippet: string }>) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some embedded and insecure contexts — the code is on screen and
      // selectable, so say that rather than failing silently.
      toast.error("Couldn't copy", { description: "Select the code and copy it manually." });
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3 sm:flex-row sm:items-center">
      {/* The code is a button as well: with the label gone from the icon, clicking the thing you
          actually want is the shortest path to it. The text stays selectable, so dragging to
          select still works — the click that ends the drag just also copies, which is harmless. */}
      <button
        type="button"
        onClick={copy}
        title="Click to copy"
        aria-label="Copy the installation code"
        className="min-w-0 flex-1 cursor-pointer select-text text-left outline-none"
      >
        <code className="block overflow-x-auto whitespace-pre font-mono text-xs leading-5 text-foreground">
          {snippet}
        </code>
      </button>
      {/* Icon only — the clipboard glyph next to a block of code needs no label. The name stays
          on aria-label, which is the only place a screen reader was reading it from anyway. */}
      <Button
        variant="outline"
        size="icon-sm"
        onClick={copy}
        className="shrink-0 cursor-pointer"
        aria-label={copied ? "Code copied" : "Copy the installation code"}
      >
        {copied
          ? <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          : <Copy className="h-4 w-4" aria-hidden />}
      </Button>
    </div>
  );
}
