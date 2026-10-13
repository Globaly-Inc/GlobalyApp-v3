"use client";

import { Bold, Code, Italic, Link, List, ListOrdered, Strikethrough } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { MarkFormat } from "./markdown";

const TOOLBAR: ReadonlyArray<{ format: MarkFormat; icon: typeof Bold; label: string; separatorBefore?: boolean }> = [
  { format: "bold", icon: Bold, label: "Bold" },
  { format: "italic", icon: Italic, label: "Italic" },
  { format: "strikethrough", icon: Strikethrough, label: "Strikethrough" },
  { format: "bullet", icon: List, label: "Bullet list", separatorBefore: true },
  { format: "numbered", icon: ListOrdered, label: "Numbered list" },
  { format: "link", icon: Link, label: "Link", separatorBefore: true },
  { format: "code", icon: Code, label: "Code" },
];

/** The composer's markdown-inserting toolbar row — desktop only (mobile keyboards cover it). */
export function ComposerToolbar({ onFormat }: Readonly<{ onFormat: (mark: MarkFormat) => void }>) {
  return (
    <div className="hidden items-center gap-0.5 border-b border-border px-2 py-1 md:flex">
      {TOOLBAR.map(({ format: mark, icon: Icon, label, separatorBefore }) => (
        <span key={mark} className="flex items-center">
          {separatorBefore && <Separator orientation="vertical" className="mx-1 h-4" />}
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={() => onFormat(mark)}
            title={label}
            aria-label={label}
          >
            <Icon className="size-3.5" />
          </Button>
        </span>
      ))}
    </div>
  );
}
