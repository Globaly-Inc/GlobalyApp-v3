"use client";

import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BusinessProfile } from "@/app/business/apis/types";

export function MediaCard({ profile, readOnly }: Readonly<{ profile: BusinessProfile; readOnly: boolean }>) {
  const gallery = profile.gallery_images ?? [];
  const videos = profile.video_urls ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Media</CardTitle>
        {!readOnly && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => toast("Coming soon", { description: "Uploading gallery photos and videos isn't available yet." })}
          >
            <Plus className="h-3.5 w-3.5" /> Add media
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {gallery.length === 0 && videos.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">No media added yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {gallery.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element -- externally stored gallery URL
              <img key={url} src={url} alt="" className="aspect-square rounded-lg border border-border object-cover" />
            ))}
            {videos.map((url) => (
              <video key={url} src={url} className="aspect-square rounded-lg border border-border bg-black object-cover" muted />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
