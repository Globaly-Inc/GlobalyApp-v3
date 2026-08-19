"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Sparkles, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { checkAiAvailable, composeWithAi, createFeedPost, uploadFeedMedia } from "../store/home-slice";
import { MAX_MEDIA, MAX_POST_LENGTH, POST_TYPES, VISIBILITY_OPTIONS } from "../const";
import type { PostMedia } from "../apis/types";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime";

export function FeedComposer() {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.profile.profile);
  const aiAvailable = useAppSelector((state) => state.home.aiAvailable);

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
        // A personal post carries no business_id — the column is nullable precisely so this works.
        business_id: null,
        media: media.map(({ storage_path, type, mime_type }) => ({ storage_path, type, mime_type })),
      }),
    );
    setSubmitting(false);
    if (createFeedPost.rejected.match(result)) {
      toast.error("Couldn't post", { description: result.error.message });
      return;
    }
    reset();
  };

  const initial = mounted ? profile?.first_name?.[0]?.toUpperCase() ?? "U" : "U";
  const avatarPhotoUrl = mounted ? profile?.photo_url : null;
  const avatar = (
    <Avatar className="size-9 shrink-0">
      {avatarPhotoUrl && <AvatarImage src={avatarPhotoUrl} alt={profile?.first_name} />}
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
        className="gap-1.5 text-muted-foreground"
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
        className="gap-1.5 text-muted-foreground"
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
              Share something with your network...
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
          {POST_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setPostType(type.value)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                postType === type.value
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              <type.icon className="h-3.5 w-3.5" />
              {type.label}
            </button>
          ))}
        </div>

        {/* Write with AI — hidden entirely when the backend has no provider key, rather than offering a
            button that can only fail. */}
        {aiAvailable && (
          <div className="flex justify-end">
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
          </div>
        )}

        <div className="space-y-1">
          <textarea
            autoFocus
            value={content}
            maxLength={MAX_POST_LENGTH}
            onChange={(event) => setContent(event.target.value)}
            placeholder="What would you like to share?"
            rows={4}
            className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <p className="text-right text-[11px] text-muted-foreground">
            {content.length}/{MAX_POST_LENGTH}
          </p>
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

        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
          <span className="text-sm font-medium">Visible to</span>
          <Combobox
            options={VISIBILITY_OPTIONS}
            value={visibility}
            onChange={setVisibility}
            placeholder="Everyone"
            searchPlaceholder="Search visibility..."
            className="h-9 w-48"
          />
        </div>

        <div className="flex items-center justify-between border-t border-border pt-2">
          {attachButtons}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={reset} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" className="gap-1.5 px-4" disabled={!canPost} onClick={submit}>
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
