"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, ImagePlus, Loader2 } from "lucide-react";
import { PrivacyBadge } from "@/components/privacy-badge";
import { useAppDispatch } from "@/lib/hooks";
import { businessApi } from "@/app/business/apis";
import { fetchMyProfile } from "@/app/business/store/business-onboarding-slice";
import type { BusinessProfile } from "@/app/business/apis/types";
import { ProfileCard } from "./profile-card";
import { MediaTile } from "./media-tile";

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
      await dispatch(fetchMyProfile()).unwrap();
      toast.success(`${file.name} added`);
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

  const items = [
    ...gallery.map((url) => ({ url, type: "gallery" as const })),
    ...videos.map((url) => ({ url, type: "video" as const })),
  ];
  // The cover tile is the first photo — a video makes a poor 2×2 cover, and with one or two items
  // a 2×2 tile just leaves a hole beside it.
  const featured = items.length > 2 ? items.findIndex((m) => m.type === "gallery") : -1;

  // Fixed "Public", as in V1 — a gallery only exists to be shown on the public profile.
  return (
    <ProfileCard id="profile-media" icon={ImageIcon} title="Media" count={items.length || undefined} badge={<PrivacyBadge isPublic />}>
      {items.length === 0 && readOnly ? (
        <p className="text-sm italic text-muted-foreground">No media added yet.</p>
      ) : (
        // Fixed-height rows, the cover spans 2×2, and dense flow back-fills any gap it leaves.
        <div className="grid grid-flow-dense auto-rows-[110px] grid-cols-2 gap-2 sm:auto-rows-[130px] sm:grid-cols-4">
          {items.map((m, i) => (
            <MediaTile
              key={m.url}
              url={m.url}
              type={m.type}
              index={i}
              featured={i === featured}
              deleting={deletingUrl === m.url}
              onRemove={readOnly ? undefined : () => handleDelete(m.url, m.type)}
            />
          ))}
          {!readOnly && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="flex animate-row-rise cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] border-dashed border-border text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-wait"
              style={{ animationDelay: `${items.length * 50}ms` }}
            >
              {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
              {uploading ? "Uploading…" : "Add media"}
            </button>
          )}
        </div>
      )}
      {!readOnly && (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          hidden
          onChange={handleFile}
        />
      )}
    </ProfileCard>
  );
}
