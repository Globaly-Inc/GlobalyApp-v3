"use client";

import { Bold, Italic, List, ListOrdered, Loader2, Sparkles, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FeedComposerToolbar({
  wrapSelection,
  prefixLines,
  aiAvailable,
  generating,
  writeWithAi,
  content,
}: Readonly<{
  wrapSelection: (open: string, close?: string) => void;
  prefixLines: (prefixFor: (lineIndex: number) => string) => void;
  aiAvailable: boolean | null;
  generating: boolean;
  writeWithAi: () => void;
  content: string;
}>) {
  return (
    <div className="flex items-center justify-between border-b border-border px-2 py-1">
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" aria-label="Bold" onClick={() => wrapSelection("**")}>
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Italic" onClick={() => wrapSelection("_")}>
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Underline" onClick={() => wrapSelection("<u>", "</u>")}>
          <Underline className="h-3.5 w-3.5" />
        </Button>
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
        <Button variant="ghost" size="icon-sm" aria-label="Bullet list" onClick={() => prefixLines(() => "- ")}>
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Numbered list"
          onClick={() => prefixLines((i) => `${i + 1}. `)}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
      </div>
      {/* Write with AI — hidden entirely when the backend has no provider key, rather than offering a
          button that can only fail. */}
      {aiAvailable && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-primary"
          disabled={generating}
          onClick={writeWithAi}
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {content.trim() ? "Improve with AI" : "Write with AI"}
        </Button>
      )}
    </div>
  );
}
