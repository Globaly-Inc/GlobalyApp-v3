"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Move, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CroppedFileInput, type CroppedFileInputHandle } from "@/components/cropped-file-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { businessProfileDetailApi } from "../../apis";

/**
 * The banner at the top of the service editor, and the owner of its upload.
 *
 * A service with no cover of its own shows the owning business's (or institution's) cover, so a
 * service always has a banner without anyone uploading one — `coverUrl` is the override and
 * `fallbackCoverUrl` the inherited image. "Use <owner> cover" clears the override rather than
 * blanking the banner. With neither set it falls back to the gradient this header had before.
 *
 * Uploading needs a saved service to attach to, so the create form passes `serviceId={null}` and
 * gets the inherited cover read-only until the service exists.
 */
export function ServiceCoverBanner({
  serviceId,
  orgBase,
  coverUrl,
  fallbackCoverUrl,
  onCoverChange,
  fallbackLabel = "business",
}: Readonly<{
  serviceId: string | null;
  orgBase: string;
  coverUrl: string | null;
  fallbackCoverUrl: string | null;
  onCoverChange: (coverUrl: string | null) => void;
  /** Names the owner in the revert action — "business" or "institution". */
  fallbackLabel?: string;
}>) {
  const pickerRef = useRef<CroppedFileInputHandle>(null);
  const [uploading, setUploading] = useState(false);
  const shown = coverUrl ?? fallbackCoverUrl;
  const isInherited = !coverUrl;

  const handleFile = async (file: File) => {
    if (!serviceId) return;
    setUploading(true);
    try {
      const updated = await businessProfileDetailApi.uploadServiceCover(serviceId, file, orgBase);
      onCoverChange(updated.cover_url);
      toast.success("Cover updated");
    } catch (e) {
      toast.error("Couldn't upload cover", { description: (e as Error).message });
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!serviceId) return;
    setUploading(true);
    try {
      await businessProfileDetailApi.removeServiceCover(serviceId, orgBase);
      onCoverChange(null);
      toast.success(`Using the ${fallbackLabel} cover`);
    } catch (e) {
      toast.error("Couldn't remove cover", { description: (e as Error).message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn("relative h-32", shown ? "bg-muted" : "bg-linear-to-br from-primary/15 to-primary/5")}>
      {shown && (
        <div className="absolute inset-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt="" className="absolute inset-0 h-full w-full select-none object-cover" draggable={false} />
          <div className="absolute inset-0 bg-linear-to-b from-transparent to-black/20" />
        </div>
      )}

      {serviceId && (
        <>
          {isInherited ? (
            <Button
              variant="secondary"
              size="sm"
              className="absolute top-4 right-4 gap-1.5"
              disabled={uploading}
              onClick={() => pickerRef.current?.pick()}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {shown ? "Replace cover" : "Add cover"}
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="secondary" size="sm" className="absolute top-4 right-4 gap-1.5" disabled={uploading} />}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                Edit cover
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => coverUrl && pickerRef.current?.adjust(coverUrl)}>
                  <Move className="h-4 w-4" />
                  Adjust image
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => pickerRef.current?.pick()}>
                  <ImagePlus className="h-4 w-4" />
                  Change image
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleRemove}>
                  <Undo2 className="h-4 w-4" />
                  Use {fallbackLabel} cover
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <CroppedFileInput ref={pickerRef} cropShape="cover" onCropped={handleFile} isSaving={uploading} />
        </>
      )}
    </div>
  );
}
