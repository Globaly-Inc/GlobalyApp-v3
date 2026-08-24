"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { feedApi } from "../apis";
import { useMentionPicker } from "../utils/use-mention-picker";
import { MentionDropdown } from "./mention-dropdown";
import type { Mention, PostMedia } from "../apis/types";

export function FeedCommentComposer({
  authorPhotoUrl,
  authorInitials,
  submitting,
  onSubmit,
}: Readonly<{
  authorPhotoUrl?: string | null;
  authorInitials: string;
  submitting: boolean;
  onSubmit: (content: string, mentions: Mention[], media: Omit<PostMedia, "url">[]) => void;
}>) {
  const [value, setValue] = useState("");
  const [attachedImage, setAttachedImage] = useState<PostMedia | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mention = useMentionPicker();

  // Auto-grow with content (typed or pasted) instead of clipping it inside a fixed-height box, up to the
  // max-height cap below — past that the textarea's own scrollbar takes over.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const handleChange = (text: string, caret: number) => {
    setValue(text);
    mention.onTextChange(text, caret, textareaRef.current);
  };

  const submit = () => {
    const content = value.trim();
    if (!content && !attachedImage) return;
    const mentions = mention.resolveMentions(content);
    const media = attachedImage ? [{ storage_path: attachedImage.storage_path, type: attachedImage.type, mime_type: attachedImage.mime_type }] : [];
    onSubmit(content, mentions, media);
    setValue("");
    mention.reset();
    setAttachedImage(null);
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Some browsers only populate `files`, not `items`, for an image paste — check both.
    const fromItems = e.clipboardData?.items
      ? [...e.clipboardData.items].find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile()
      : null;
    const fromFiles = e.clipboardData?.files ? [...e.clipboardData.files].find((f) => f.type.startsWith("image/")) : null;
    const file = fromItems ?? fromFiles;
    if (!file) return; // no image on the clipboard — let normal text paste happen
    e.preventDefault();
    setUploadingImage(true);
    try {
      const media = await feedApi.uploadMedia(file);
      setAttachedImage(media);
    } catch {
      toast.error("Couldn't upload that image");
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div className="flex items-start gap-2">
      <Avatar className="size-7 shrink-0">
        {authorPhotoUrl && <AvatarImage src={authorPhotoUrl} alt="" />}
        <AvatarFallback className="text-[10px]">{authorInitials}</AvatarFallback>
      </Avatar>
      <div className="relative min-w-0 flex-1">
        <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-muted/30 px-3.5 py-2">
          {uploadingImage && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Uploading image…
            </div>
          )}
          {attachedImage && (
            <div className="relative w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset */}
              <img src={attachedImage.url} alt="" className="max-h-32 rounded-lg border border-border object-cover" />
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                aria-label="Remove image"
                className="absolute -right-1.5 -top-1.5 cursor-pointer rounded-full bg-foreground/80 p-0.5 text-background hover:bg-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-1.5">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => handleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onKeyUp={(e) => handleChange(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !mention.mentionActive) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Write a comment... Use @ to mention"
              rows={1}
              className="max-h-40 min-h-6 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
            />
            <Button
              size="icon-sm"
              className="shrink-0 rounded-full"
              disabled={(!value.trim() && !attachedImage) || submitting || uploadingImage}
              onClick={submit}
              aria-label="Post comment"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <MentionDropdown
          matches={mention.matches}
          rect={mention.dropdownRect}
          onPick={(candidate) => {
            setValue((current) => mention.pick(current, candidate));
            textareaRef.current?.focus();
          }}
        />
      </div>
    </div>
  );
}
