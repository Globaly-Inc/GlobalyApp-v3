"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppDispatch } from "@/lib/hooks";
import { businessApi } from "@/app/business/apis";
import { fetchMyProfile } from "@/app/business/store/business-onboarding-slice";
import type { BusinessProfile } from "@/app/business/apis/types";

export function MediaCard({ profile, readOnly }: Readonly<{ profile: BusinessProfile; readOnly: boolean }>) {
  const dispatch = useAppDispatch();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);

  const gallery = profile.gallery_images ?? [];
  const videos = profile.video_urls ?? [];

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      await businessApi.uploadImage("gallery", file);
      await dispatch(fetchMyProfile());
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (url: string, type: "gallery" | "video") => {
    setDeletingUrl(url);
    try {
      await businessApi.deleteMedia(url, type);
      await dispatch(fetchMyProfile());
    } catch (err) {
      toast.error("Couldn't remove media", { description: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setDeletingUrl(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Media</CardTitle>
        {!readOnly && (
          <>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add media
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
              hidden
              onChange={handleFile}
            />
          </>
        )}
      </CardHeader>
      <CardContent>
        {gallery.length === 0 && videos.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">No media added yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {gallery.map((url) => (
              <div key={url} className="group relative aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element -- externally stored gallery URL */}
                <img src={url} alt="" className="h-full w-full rounded-lg border border-border object-cover" />
                {!readOnly && (
                  <button
                    type="button"
                    aria-label="Remove image"
                    disabled={deletingUrl === url}
                    onClick={() => handleDelete(url, "gallery")}
                    className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    {deletingUrl === url ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            ))}
            {videos.map((url) => (
              <div key={url} className="group relative aspect-square">
                <video src={url} className="h-full w-full rounded-lg border border-border bg-black object-cover" muted />
                {!readOnly && (
                  <button
                    type="button"
                    aria-label="Remove video"
                    disabled={deletingUrl === url}
                    onClick={() => handleDelete(url, "video")}
                    className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    {deletingUrl === url ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
