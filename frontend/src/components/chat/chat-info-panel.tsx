"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, FileText, MessageSquare, Pin, Play } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { fileExtension, formatFileSize, initials, isImageFile, isPdfFile, isVideoFile, previewText } from "./utils";
import type { EnquiryMessage } from "./types";

/**
 * The right-hand info panel — GlobalyOS V2's `ChatRightPanelEnhanced`, reduced to the
 * part that applies here: the gradient icon chip and "Individual Chat Info / Details &
 * pinned items" header, then a collapsible Pinned Messages section whose rows are the
 * avatar + name + `MMM d` + two-line excerpt V2 uses, jumping to the message on click.
 *
 * Shared Files below it is V2's too: the same square thumbnail grid with a filename
 * overlay on hover, collecting every attachment in the thread.
 *
 * V2's Members section is not reproduced — it is a group/space concept, and an enquiry
 * thread is always exactly two parties, already named in the header.
 *
 * Both lists are derived from the thread already in the store rather than fetched (V2 has
 * separate `/pinned` and `/files` endpoints because it paginates its history; ours arrives
 * whole, so everything is already here).
 */
function SectionHeader({
  icon: Icon,
  label,
  count,
  open,
  onToggle,
}: Readonly<{
  icon: typeof Pin;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-muted/50"
    >
      <h4 className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        {label}
        {count > 0 && <span className="text-xs font-normal text-muted-foreground">({count})</span>}
      </h4>
      {open ? (
        <ChevronUp className="size-4 text-muted-foreground" aria-hidden />
      ) : (
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      )}
    </button>
  );
}

/** `Jun 18` — V2 stamps its pinned rows with `format(date, "MMM d")`. */
const pinStamp = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso));

export function ChatInfoPanel({
  messages,
  onJumpToMessage,
}: Readonly<{ messages: EnquiryMessage[]; onJumpToMessage: (messageId: number) => void }>) {
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(false);
  const pinned = messages.filter((m) => m.is_pinned);
  const files = messages.flatMap((m) => m.attachments);

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex shrink-0 items-center gap-2 border-b border-border p-4">
        <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/20 to-sky-500/5">
          <MessageSquare className="size-4 text-sky-500" aria-hidden />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Individual Chat Info</h3>
          <p className="text-xs text-muted-foreground">Details &amp; pinned items</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SectionHeader
          icon={Pin}
          label="Pinned Messages"
          count={pinned.length}
          open={pinnedOpen}
          onToggle={() => setPinnedOpen(!pinnedOpen)}
        />

        {pinnedOpen && (
          <div className="px-4 pb-4">
            {pinned.length === 0 ? (
              <div className="py-4 text-center">
                <Pin className="mx-auto mb-2 size-8 text-muted-foreground/40" aria-hidden />
                <p className="text-sm text-muted-foreground">No pinned messages yet</p>
                <p className="mt-1 text-xs text-muted-foreground/80">
                  Hover a message and pin it to keep it here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {pinned.map((message) => (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => onJumpToMessage(message.id)}
                    className={cn(
                      "w-full cursor-pointer rounded-lg bg-muted/50 p-2 text-left transition-colors hover:bg-muted",
                      "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <Avatar className="size-5">
                        {message.sender_avatar && (
                          <AvatarImage src={message.sender_avatar} alt={message.sender_name} />
                        )}
                        <AvatarFallback className="text-[8px]">{initials(message.sender_name)}</AvatarFallback>
                      </Avatar>
                      <span className="truncate text-xs font-medium">{message.sender_name}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {pinStamp(message.created_at)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{previewText(message.body)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="border-t border-border" />

        <SectionHeader
          icon={FileText}
          label="Shared Files"
          count={files.length}
          open={filesOpen}
          onToggle={() => setFilesOpen(!filesOpen)}
        />

        {filesOpen && (
          <div className="px-4 pb-4">
            {files.length === 0 ? (
              <div className="py-4 text-center">
                <FileText className="mx-auto mb-2 size-8 text-muted-foreground/40" aria-hidden />
                <p className="text-sm text-muted-foreground">No files shared yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {files.map((file) => {
                  const image = isImageFile(file.mime_type);
                  const video = isVideoFile(file.mime_type);
                  const pdf = isPdfFile(file.mime_type, file.original_name);
                  return (
                    <a
                      key={file.storage_path}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={file.original_name}
                      className="group relative aspect-square overflow-hidden rounded-lg bg-muted/50 text-left transition-all hover:ring-2 hover:ring-primary/50"
                    >
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed, expiring, per-viewer URL
                        <img src={file.url} alt={file.original_name} className="size-full object-cover" loading="lazy" />
                      ) : video ? (
                        <span className="flex size-full items-center justify-center">
                          <span className="flex size-8 items-center justify-center rounded-full bg-black/60">
                            <Play className="ml-0.5 size-4 text-white" aria-hidden />
                          </span>
                        </span>
                      ) : (
                        <span
                          className={cn(
                            "flex size-full flex-col items-center justify-center",
                            pdf && "bg-destructive/10",
                          )}
                        >
                          <FileText
                            className={cn("size-6", pdf ? "text-destructive" : "text-muted-foreground")}
                            aria-hidden
                          />
                          <span
                            className={cn(
                              "mt-1 text-[9px] font-medium",
                              pdf ? "text-destructive" : "text-muted-foreground",
                            )}
                          >
                            {fileExtension(file.original_name)}
                          </span>
                        </span>
                      )}

                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="block truncate text-[10px] text-white">{file.original_name}</span>
                        <span className="block text-[8px] text-white/70">{formatFileSize(file.size_bytes)}</span>
                      </span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
