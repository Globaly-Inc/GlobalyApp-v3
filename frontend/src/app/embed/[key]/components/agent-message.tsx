"use client";

import { Paperclip } from "lucide-react";
import { RichTextMessage } from "@/components/chat/rich-text-message";
import type { WidgetMessage } from "../utils";

/** First and last initial — "Alex Morgan" → "AM". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)?.[0] ?? "" : "")).toUpperCase() || "?";
}

/**
 * A staff member's reply: a real bubble with their initials and name, so it never reads as the AI,
 * which answers without a bubble beside the Aly orb.
 */
export function AgentMessage({ message }: Readonly<{ message: WidgetMessage }>) {
  const name = message.sender_name ?? "Admissions team";
  return (
    <div className="flex w-full gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-semibold text-sky-800">
        {initials(name)}
      </span>
      <div className="flex min-w-0 max-w-[85%] flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{name}</span> · Admissions team
        </p>
        {message.content && (
          <div className="rounded-2xl rounded-tl-md bg-sky-50 px-4 py-2.5 text-[0.9375rem] leading-relaxed">
            <RichTextMessage body={message.content} />
          </div>
        )}
        {!!message.files?.length && (
          <div className="flex flex-wrap gap-1.5">
            {message.files.map((f) => (
              <a
                key={f.url}
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Paperclip className="size-3" aria-hidden />
                <span className="max-w-40 truncate">{f.original_name}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
