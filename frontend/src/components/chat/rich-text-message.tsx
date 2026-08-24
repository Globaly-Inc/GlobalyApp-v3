"use client";

import { ExternalLink } from "lucide-react";
import { parseMessageBody } from "./markdown";

/**
 * Renders a message body with the inline formatting the composer's toolbar produces —
 * the student-side counterpart of GlobalyOS V2's `RichTextMessage`.
 *
 * V2 builds an HTML string and pushes it through DOMPurify + `dangerouslySetInnerHTML`.
 * Here the parser returns data and this component emits real React elements, so there
 * is no HTML string to escape and no sanitiser in the path. Same visual result, one
 * fewer way to get XSS wrong.
 *
 * Content links (`[/tasks:…]`) and Meet cards are V2-only: neither module exists on the
 * student side, so they are not parsed.
 */
export function RichTextMessage({ body }: Readonly<{ body: string }>) {
  return (
    <p className="whitespace-pre-wrap break-words">
      {parseMessageBody(body).map((segment, i) => {
        switch (segment.kind) {
          case "code":
            return (
              <code key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                {segment.value}
              </code>
            );
          case "link":
            return (
              <a
                key={i}
                href={segment.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                {segment.label}
                <ExternalLink className="inline-block size-3 shrink-0" aria-hidden />
              </a>
            );
          case "strong":
            return <strong key={i}>{segment.value}</strong>;
          case "em":
            return <em key={i}>{segment.value}</em>;
          case "del":
            return <del key={i}>{segment.value}</del>;
          default:
            return <span key={i}>{segment.value}</span>;
        }
      })}
    </p>
  );
}
