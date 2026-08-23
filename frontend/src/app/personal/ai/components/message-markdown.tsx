"use client";

import { useMemo } from "react";
import { markdownToHtml } from "../utils/markdown";
import { cn } from "@/lib/utils";

/**
 * Counsellor prose. Typography comes from @tailwindcss/typography; the `prose-*`
 * overrides pull it onto the app's own tokens so it reads the same in dark mode.
 * The HTML is escaped and DOMPurify-sanitized in markdownToHtml.
 */
export function MessageMarkdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => markdownToHtml(text), [text]);

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-[0.9375rem] leading-7 text-foreground",
        "prose-p:my-3 prose-p:text-foreground first:prose-p:mt-0 last:prose-p:mb-0",
        "prose-headings:font-semibold prose-headings:text-foreground prose-headings:mt-5 prose-headings:mb-2",
        "prose-h2:text-base prose-h3:text-[0.9375rem] prose-h4:text-sm",
        "prose-strong:font-semibold prose-strong:text-foreground",
        "prose-a:font-medium prose-a:text-primary prose-a:underline prose-a:underline-offset-2",
        "prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:text-foreground prose-li:marker:text-muted-foreground",
        "prose-blockquote:border-l-2 prose-blockquote:border-primary/40 prose-blockquote:pl-4 prose-blockquote:not-italic prose-blockquote:text-muted-foreground",
        "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal",
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:rounded-xl prose-pre:border prose-pre:bg-muted prose-pre:text-foreground",
        "prose-hr:my-5 prose-hr:border-border",
        "prose-table:my-3 prose-table:text-sm prose-th:text-foreground prose-td:text-foreground",
        "prose-th:border-b prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:text-left",
        "prose-td:border-b prose-td:border-border/60 prose-td:px-3 prose-td:py-2",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
