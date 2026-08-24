"use client";

import { FileText, Image as ImageIcon, Loader2, Paperclip, Plus, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { fileExtension, isImageFile } from "../utils";

/**
 * The composer's `+` menu and its selected-file strip — GlobalyOS V2's
 * MessageComposer attachment UI: a popover with "Upload file / Upload image / Upload
 * video", then thumbnails above the input each with a red X to remove it.
 *
 * The three menu entries differ only in the `accept` filter they put on the picker, which
 * is exactly what V2's `triggerFilePicker(type)` does.
 */

/** Matches the backend allow-list in message-media.service.ts. */
export const ACCEPT = {
  file: ".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.md,application/pdf,text/plain,text/csv",
  image: "image/jpeg,image/png,image/webp,image/gif",
  video: "video/mp4,video/webm,video/quicktime",
} as const;

export type UploadKind = keyof typeof ACCEPT;

/** A file picked in the composer, before or during upload. */
export interface PendingAttachment {
  /** Stable key — File objects aren't comparable and names can repeat. */
  key: string;
  file: File;
  /** Object URL for an image preview; undefined for anything else. */
  preview?: string;
  /** Set once the upload lands. Null while in flight, so send() knows to wait. */
  storagePath: string | null;
  failed?: boolean;
}

const MENU: ReadonlyArray<{ kind: UploadKind; label: string; icon: typeof Paperclip }> = [
  { kind: "file", label: "Upload file", icon: Paperclip },
  { kind: "image", label: "Upload image", icon: ImageIcon },
  { kind: "video", label: "Upload video", icon: Video },
];

export function AttachmentMenu({
  disabled,
  onPick,
}: Readonly<{ disabled: boolean; onPick: (kind: UploadKind) => void }>) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            className="text-muted-foreground hover:text-foreground"
            disabled={disabled}
            aria-label="Add an attachment"
            title="Add an attachment"
          />
        }
      >
        <Plus className="size-4" />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-48 gap-0 p-1">
        {MENU.map(({ kind, label, icon: Icon }) => (
          <Button
            key={kind}
            variant="ghost"
            className="h-9 w-full justify-start gap-2 font-normal"
            onClick={() => onPick(kind)}
          >
            <Icon className="size-4" />
            {label}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function AttachmentPreviews({
  pending,
  onRemove,
}: Readonly<{ pending: PendingAttachment[]; onRemove: (key: string) => void }>) {
  if (pending.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      {pending.map((item) => (
        <div key={item.key} className="relative">
          {item.preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL, nothing for next/image to optimise
            <img
              src={item.preview}
              alt={item.file.name}
              className={cn("size-14 rounded-md border border-border object-cover", item.failed && "opacity-40")}
            />
          ) : (
            <div
              className={cn(
                "flex size-14 flex-col items-center justify-center rounded-md border border-border bg-muted p-1",
                item.failed && "opacity-40",
              )}
            >
              <FileText className="size-5 text-muted-foreground" aria-hidden />
              <span className="mt-0.5 w-full truncate text-center text-[9px] text-muted-foreground">
                {fileExtension(item.file.name)}
              </span>
            </div>
          )}

          {/* Still uploading: the send button is disabled anyway, but the spinner says why. */}
          {item.storagePath === null && !item.failed && (
            <span className="absolute inset-0 flex items-center justify-center rounded-md bg-background/60">
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
            </span>
          )}
          {item.failed && (
            <span className="absolute inset-0 flex items-center justify-center rounded-md bg-destructive/10 text-[9px] font-medium text-destructive">
              Failed
            </span>
          )}

          <button
            type="button"
            onClick={() => onRemove(item.key)}
            aria-label={`Remove ${item.file.name}`}
            className="absolute -right-1.5 -top-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Builds a pending entry, minting an object-URL preview only for images. */
export function toPending(file: File): PendingAttachment {
  return {
    key: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    preview: isImageFile(file.type) ? URL.createObjectURL(file) : undefined,
    storagePath: null,
  };
}
