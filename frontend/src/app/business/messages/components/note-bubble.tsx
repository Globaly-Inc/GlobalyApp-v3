"use client";

import { StickyNote } from "lucide-react";
import { AttachmentList } from "@/components/chat/attachment-list";
import { RichTextMessage } from "@/components/chat/rich-text-message";
import { messageTime } from "@/components/chat/utils";
import type { VisitorNote } from "@/app/business/ai-widget/apis/types";

/**
 * A staff-only note, inline in the transcript at the time it was written. Amber, full column
 * width and labelled, so it can never be mistaken for something the visitor saw.
 */
export function NoteBubble({ note }: Readonly<{ note: VisitorNote }>) {
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm leading-relaxed text-foreground">
      <p className="mb-1 flex items-center gap-1.5 text-xs text-amber-800">
        <StickyNote className="size-3.5" aria-hidden />
        <span className="font-medium">Internal note</span> · {note.author_name} · {messageTime(note.created_at)}
        <span className="ml-auto">Only your team can see this</span>
      </p>
      {note.content && <RichTextMessage body={note.content} />}
      {!!note.attachments?.length && (
        <div className="mt-2">
          <AttachmentList attachments={note.attachments} />
        </div>
      )}
    </div>
  );
}
