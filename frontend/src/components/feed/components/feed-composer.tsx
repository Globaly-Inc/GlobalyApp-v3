"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Globe, Image as ImageIcon, Italic, List, ListOrdered, Loader2, Sparkles, Underline, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { checkAiAvailable, composeWithAi, createFeedPost, uploadFeedMedia } from "../store/feed-slice";
import { MAX_MEDIA, MAX_POST_LENGTH, POST_TYPE_STYLES, POST_TYPES, VISIBILITY_OPTIONS } from "../const";
import { useMentionPicker } from "../utils/use-mention-picker";
import { MentionDropdown } from "./mention-dropdown";
import type { PostMedia } from "../apis/types";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime";

type FeedComposerProps = {
  /** null posts as the signed-in person; a business id posts on that business's behalf. */
  businessId?: number | null;
  avatarUrl?: string | null;
  avatarFallback?: string;
  placeholder?: string;
};

export function FeedComposer({
  businessId = null,
  avatarUrl = null,
  avatarFallback = "U",
  placeholder = "Share something with your network...",
}: FeedComposerProps) {
  const dispatch = useAppDispatch();
  const aiAvailable = useAppSelector((state) => state.feed.aiAvailable);

  // `avatarUrl`/`avatarFallback` can already differ between an SSR pass and a client-hydrated Redux store
  // (e.g. after an earlier navigation) — gate on `mounted` so the very first paint matches whatever HTML is
  // being hydrated against, rather than momentarily flashing the "live" value.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState("");
  const [postType, setPostType] = useState("social");
  const [visibility, setVisibility] = useState("everyone");
  const [media, setMedia] = useState<PostMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mention = useMentionPicker();

  useEffect(() => {
    if (aiAvailable === null) dispatch(checkAiAvailable());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    setExpanded(false);
    setContent("");
    setPostType("social");
    setVisibility("everyone");
    setMedia([]);
    mention.reset();
  };

  const handleContentChange = (text: string, caret: number) => {
    setContent(text);
    mention.onTextChange(text, caret, textareaRef.current);
  };

  /** Wraps the current selection in marker pairs (bold/italic/underline), keeping it selected afterward. */
  const wrapSelection = (open: string, close = open) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const selected = content.slice(start, end);
    const next = `${content.slice(0, start)}${open}${selected}${close}${content.slice(end)}`;
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + open.length, start + open.length + selected.length);
    });
  };

  /** Prefixes every line touched by the current selection with a bullet/number marker. */
  const prefixLines = (prefixFor: (lineIndex: number) => string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const lineStart = content.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = content.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? content.length : nextBreak;
    const prefixed = content
      .slice(lineStart, lineEnd)
      .split("\n")
      .map((line, i) => `${prefixFor(i)}${line}`)
      .join("\n");
    setContent(`${content.slice(0, lineStart)}${prefixed}${content.slice(lineEnd)}`);
    requestAnimationFrame(() => el.focus());
  };

  const pickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_MEDIA - media.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${MAX_MEDIA} files`);
      return;
    }
    setUploading(true);
    // Upload immediately: the post request then carries only storage paths, and the preview below is the
    // real uploaded object rather than a local blob that might never reach the server (the V2 bug).
    for (const file of Array.from(files).slice(0, room)) {
      const result = await dispatch(uploadFeedMedia(file));
      if (uploadFeedMedia.rejected.match(result)) {
        toast.error(`Couldn't upload ${file.name}`, { description: result.error.message });
        continue;
      }
      setMedia((current) => [...current, result.payload]);
    }
    setUploading(false);
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
    const list = new DataTransfer();
    list.items.add(file);
    await pickFiles(list.files);
  };

  const writeWithAi = async () => {
    setGenerating(true);
    const result = await dispatch(composeWithAi({ post_type: postType, draft: content.trim() || null }));
    setGenerating(false);
    if (composeWithAi.rejected.match(result)) {
      toast.error("Couldn't write that", { description: result.error.message });
      return;
    }
    setContent(result.payload.content);
  };

  const submit = async () => {
    const trimmed = content.trim();
    if (!trimmed && media.length === 0) return;
    setSubmitting(true);
    const result = await dispatch(
      createFeedPost({
        content: trimmed,
        post_type: postType,
        visibility,
        business_id: businessId,
        media: media.map(({ storage_path, type, mime_type }) => ({ storage_path, type, mime_type })),
        mentions: mention.resolveMentions(trimmed),
      }),
    );
    setSubmitting(false);
    if (createFeedPost.rejected.match(result)) {
      toast.error("Couldn't post", { description: result.error.message });
      return;
    }
    reset();
  };

  const initial = mounted ? avatarFallback : "U";
  const avatarPhotoUrl = mounted ? avatarUrl : null;
  const avatar = (
    <Avatar className="size-9 shrink-0">
      {avatarPhotoUrl && <AvatarImage src={avatarPhotoUrl} alt={initial} />}
      <AvatarFallback>{initial}</AvatarFallback>
    </Avatar>
  );

  const fileInputs = (
    <>
      <input
        ref={imageInput}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          void pickFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={videoInput}
        type="file"
        accept={VIDEO_ACCEPT}
        hidden
        onChange={(event) => {
          void pickFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </>
  );

  const attachButtons = (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 rounded-full text-muted-foreground"
        disabled={uploading}
        onClick={() => {
          setExpanded(true);
          imageInput.current?.click();
        }}
      >
        <ImageIcon className="h-4 w-4 text-emerald-600" /> Image
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 rounded-full text-muted-foreground"
        disabled={uploading}
        onClick={() => {
          setExpanded(true);
          videoInput.current?.click();
        }}
      >
        <Video className="h-4 w-4 text-blue-600" /> Video
      </Button>
      {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
    </div>
  );

  // ── Collapsed ──
  if (!expanded) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-5">
          <div className="flex items-center gap-3">
            {avatar}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex-1 cursor-text rounded-full bg-muted px-4 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted/70"
            >
              {placeholder}
            </button>
          </div>
          <div className="border-t border-border pt-2">{attachButtons}</div>
          {fileInputs}
        </CardContent>
      </Card>
    );
  }

  // ── Expanded ──
  const canPost = (!!content.trim() || media.length > 0) && !submitting && !uploading;

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          {avatar}
          {POST_TYPES.map((type) => {
            const style = POST_TYPE_STYLES[type.value];
            const active = postType === type.value;
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => setPostType(type.value)}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? cn("border-transparent", style?.badge) : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                <type.icon className="h-3.5 w-3.5" />
                {type.label}
              </button>
            );
          })}
        </div>

        <div className="relative space-y-1 rounded-lg border border-input bg-muted/20 focus-within:border-ring">
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
          <textarea
            ref={textareaRef}
            autoFocus
            value={content}
            maxLength={MAX_POST_LENGTH}
            onChange={(event) => handleContentChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
            onKeyUp={(event) => handleContentChange(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)}
            onPaste={handlePaste}
            placeholder="What's on your mind? Use @ to mention someone, or paste an image"
            rows={4}
            className="w-full resize-y bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <p className="px-3 pb-1.5 text-right text-[11px] text-muted-foreground">
            {content.length}/{MAX_POST_LENGTH}
          </p>
          <MentionDropdown
            matches={mention.matches}
            rect={mention.dropdownRect}
            onPick={(candidate) => {
              setContent((current) => mention.pick(current, candidate));
              textareaRef.current?.focus();
            }}
          />
        </div>

        {media.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {media.map((item) => (
              <div key={item.storage_path} className="group relative overflow-hidden rounded-lg border border-border">
                {item.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed GCS URL, not a static asset
                  <img src={item.url} alt="" className="h-28 w-full object-cover" />
                ) : (
                  <video src={item.url} className="h-28 w-full bg-black object-cover" muted playsInline controls />
                )}
                <button
                  type="button"
                  aria-label="Remove attachment"
                  onClick={() => setMedia((current) => current.filter((m) => m.storage_path !== item.storage_path))}
                  className="absolute right-1 top-1 cursor-pointer rounded-full bg-background/90 p-1 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 rounded-full border border-border bg-muted/30 py-1 pl-3 pr-1.5 w-fit">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Visible to:</span>
          <Combobox
            options={VISIBILITY_OPTIONS}
            value={visibility}
            onChange={setVisibility}
            placeholder="Everyone"
            searchPlaceholder="Search visibility..."
            className="h-7 w-36 border-none bg-transparent px-1.5 text-xs font-medium shadow-none"
          />
        </div>

        <div className="flex items-center justify-between border-t border-border pt-2">
          {attachButtons}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={reset} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" className="gap-1.5 rounded-full px-4" disabled={!canPost} onClick={submit}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Post
            </Button>
          </div>
        </div>
        {fileInputs}
      </CardContent>
    </Card>
  );
}
