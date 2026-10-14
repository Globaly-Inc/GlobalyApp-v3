"use client";

import { FormSection } from "@/components/ui/form-section";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageDropzone } from "@/components/image-dropzone";
import type { CountryPanelProps } from "../types";

export function CountryImagesPanel({
  country,
  onChange,
  onPendingFile,
}: CountryPanelProps & { onPendingFile: (file: File, previewUrl: string) => void }) {
  const gallery = country.gallery_images ?? [];

  return (
    <FormSection title="Images" description="Hero, thumbnail, gallery and video." columns={1}>
        <div className="flex flex-col gap-2">
          <Label>Hero image</Label>
          <ImageDropzone
            value={country.hero_image_url}
            onChange={(url) => onChange({ hero_image_url: url })}
            onDeferredPick={onPendingFile}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Thumbnail image</Label>
          <ImageDropzone
            value={country.thumbnail_image_url}
            onChange={(url) => onChange({ thumbnail_image_url: url })}
            onDeferredPick={onPendingFile}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Gallery</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {gallery.map((url, i) => (
              <ImageDropzone
                key={url}
                value={url}
                onChange={(next) => onChange({ gallery_images: next ? gallery.map((u, idx) => (idx === i ? next : u)) : gallery.filter((_, idx) => idx !== i) })}
                onDeferredPick={onPendingFile}
              />
            ))}
            <ImageDropzone
              value={null}
              onChange={(url) => url && onChange({ gallery_images: [...gallery, url] })}
              onDeferredPick={onPendingFile}
            />
          </div>
        </div>

        <FormField label="YouTube embed URL" htmlFor="country-youtube">
          <Input
            id="country-youtube"
            className="h-10"
            placeholder="https://www.youtube.com/embed/…"
            value={country.youtube_embed_url ?? ""}
            onChange={(e) => onChange({ youtube_embed_url: e.target.value || null })}
          />
        </FormField>
    </FormSection>
  );
}
