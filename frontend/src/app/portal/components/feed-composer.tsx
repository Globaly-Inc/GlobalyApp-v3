"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Sparkles, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { checkAiAvailable, composeWithAi, createFeedPost, uploadFeedMedia } from "../store/feed-slice";
import { MAX_MEDIA, MAX_POST_LENGTH, POST_TYPES, VISIBILITY_OPTIONS } from "../const";
import type { PostMedia } from "../apis/types";
import type { PortalIdentity } from "../types";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime";

/**
 * Shape and spacing follow V1's FeedComposer: a p-3 sm:p-4 card, the avatar beside a flex-1 column, the
 * collapsed state as a rounded-full muted button, and one action bar separated by mt-3 pt-3 border-t.
 *
 * `identity` decides which profile the post is published as — the composer never infers it. That is the
 * one thing that must not go wrong here: a business post created under the user's personal identity (or
 * the reverse) is invisible to the audience it was meant for and visible to one it wasn't.
 *
 * `visibilityOptions` differs per portal because the audiences differ; every value in either list is
 * enforced server-side.
 */
export function FeedComposer({
  identity,
  visibilityOptions = VISIBILITY_OPTIONS,
}: {
  identity: PortalIdentity;
  visibilityOptions?: { value: string; label: string }[];
}) {
  const dispatch = useAppDispatch();
  const aiAvailable = useAppSelector((state) => state.feed.aiAvailable);

  // The avatar depends on client-only state, so it renders neutral until mount to avoid a hydration mismatch.
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
    // real uploaded object rather than a local blob that might never reach the server.
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
        // The whole personal/business distinction, in one field: null for a personal post (the column is
        // nullable precisely so this works), the business id when posting as a business. The server
        // re-checks membership before accepting it.
        business_id: identity.businessId,
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

  const initial = mounted ? (identity.name?.[0]?.toUpperCase() ?? "U") : "U";
  const avatarPhotoUrl = mounted ? identity.photoUrl : null;
  const canPost = (!!content.trim() || media.length > 0) && !submitting && !uploading;

  return (
    <Card className="p-3 sm:p-4 bg-card border-border shadow-sm">
      <div className="flex gap-2 sm:gap-3">
        <Avatar className="h-8 w-8 sm:h-10 sm:w-10 border border-border/50 shrink-0">
          {avatarPhotoUrl && <AvatarImage src={avatarPhotoUrl} alt={identity.name ?? ""} />}
          <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs sm:text-sm">
            {initial}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 space-y-3">
          {!expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full cursor-text text-left px-4 py-2.5 rounded-full bg-muted/50 hover:bg-muted border border-border/50 text-muted-foreground text-sm transition-colors"
            >
              Share something with your network...
            </button>
          ) : (
            <>
              {/* Post type pills */}
              <div className="flex gap-1.5 overflow-x-auto py-1.5 -mx-1 px-1">
                {POST_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setPostType(type.value)}
                    className={cn(
                      "flex cursor-pointer items-center gap-1 px-2.5 py-1 rounded-full text-xs sm:text-sm font-medium transition-all border whitespace-nowrap flex-shrink-0",
                      postType === type.value
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:border-border",
                    )}
                  >
                    <type.icon className="h-3.5 w-3.5" />
                    {type.label}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                {/* Write with AI is hidden entirely when the backend has no provider key, rather than
                    offering a button that can only fail. */}
                {aiAvailable && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-primary h-7"
                      disabled={generating}
                      onClick={writeWithAi}
                    >
                      {generating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {content.trim() ? "Improve with AI" : "Write with AI"}
                    </Button>
                  </div>
                )}
                <textarea
                  autoFocus
                  value={content}
                  maxLength={MAX_POST_LENGTH}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="What would you like to share?"
                  rows={4}
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {content.length}/{MAX_POST_LENGTH}
                </p>
              </div>

              {media.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {media.map((item) => (
                    <div
                      key={item.storage_path}
                      className="relative group aspect-video rounded-lg overflow-hidden border border-border"
                    >
                      {item.type === "video" ? (
                        <video src={item.url} className="w-full h-full object-cover" muted playsInline />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                        <img src={item.url} alt="" className="w-full h-full object-cover" />
                      )}
                      <button
                        type="button"
                        aria-label="Remove attachment"
                        onClick={() => setMedia((current) => current.filter((m) => m.storage_path !== item.storage_path))}
                        className="absolute top-1 right-1 cursor-pointer p-1 bg-background/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 rounded-lg border border-border/50 bg-muted/20">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">Visible to</span>
                  <Combobox
                    options={visibilityOptions}
                    value={visibility}
                    onChange={setVisibility}
                    placeholder="Everyone"
                    searchPlaceholder="Search visibility..."
                    className="h-8 w-40"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div
        className={cn(
          "flex items-center justify-between mt-3 pt-3 border-t border-border/50",
          !expanded && "flex-wrap gap-2",
        )}
      >
        <div className="flex items-center gap-1">
          <input
            ref={imageInput}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            className="hidden"
            onChange={(event) => {
              void pickFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={videoInput}
            type="file"
            accept={VIDEO_ACCEPT}
            className="hidden"
            onChange={(event) => {
              void pickFiles(event.target.files);
              event.target.value = "";
            }}
          />

          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground gap-2"
            disabled={uploading}
            onClick={() => {
              setExpanded(true);
              imageInput.current?.click();
            }}
          >
            <ImageIcon className="h-4 w-4 text-emerald-500" />
            <span className="hidden sm:inline">Image</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground gap-2"
            disabled={uploading}
            onClick={() => {
              setExpanded(true);
              videoInput.current?.click();
            }}
          >
            <Video className="h-4 w-4 text-blue-500" />
            <span className="hidden sm:inline">Video</span>
          </Button>

          {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        <div className="flex items-center gap-2">
          {expanded && (
            <>
              <Button variant="ghost" size="sm" onClick={reset} disabled={submitting} className="text-muted-foreground">
                Cancel
              </Button>
              <Button className="gap-2" disabled={!canPost} onClick={submit}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Post
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
