"use client";

import { useRef } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CroppedFileInput, type CroppedFileInputHandle } from "@/components/cropped-file-input";
import { cn } from "@/lib/utils";

/**
 * Facebook-style cover photo + overlapping circular logo, each independently editable.
 * Upload timing is the caller's call — pass an immediate-upload handler, or one that just
 * stashes the File for later (e.g. a create form that uploads on submit).
 */
export function CoverLogoEditor({
  coverUrl = null,
  onCoverFile,
  coverUploading = false,
  logoUrl,
  logoFallback,
  onLogoFile,
  logoUploading = false,
  className,
  hideLogo = false,
  roundPhoto = false,
}: Readonly<{
  coverUrl?: string | null;
  onCoverFile?: (file: File) => void;
  coverUploading?: boolean;
  logoUrl: string | null;
  logoFallback: string;
  onLogoFile: (file: File) => void;
  logoUploading?: boolean;
  className?: string;
  /** Skip the overlapping logo button — for callers that render the logo themselves alongside other header content. */
  hideLogo?: boolean;
  /** A person's photo: full-bleed circle (object-cover, no padding/background) instead of a padded square logo tile. */
  roundPhoto?: boolean;
}>) {
  const coverPickerRef = useRef<CroppedFileInputHandle>(null);
  const logoPickerRef = useRef<CroppedFileInputHandle>(null);

  return (
    <div className={cn("relative h-40 bg-gradient-to-br from-primary to-primary/60 sm:h-48", className)}>
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {onCoverFile && (
        <>
          <Button
            variant="secondary"
            size="sm"
            className="absolute right-4 top-4 gap-1.5"
            disabled={coverUploading}
            onClick={() => coverPickerRef.current?.pick()}
          >
            {coverUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Edit cover
          </Button>
          <CroppedFileInput ref={coverPickerRef} cropShape="square" onCropped={onCoverFile} isSaving={coverUploading} />
        </>
      )}

      {!hideLogo && (
        <button
          type="button"
          className="group absolute -bottom-12 left-10 cursor-pointer"
          onClick={() => logoPickerRef.current?.pick()}
          aria-label="Edit logo"
        >
          <Avatar
            className={cn("size-24 rounded-xl border-4 border-background shadow-lg", !roundPhoto && "bg-white")}
          >
            {logoUrl && (
              <AvatarImage
                src={logoUrl}
                alt=""
                className={cn("rounded-lg", roundPhoto ? "object-cover" : "object-contain p-1")}
              />
            )}
            <AvatarFallback className="rounded-lg text-2xl">{logoFallback}</AvatarFallback>
          </Avatar>
          <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
            {logoUploading ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
          </span>
        </button>
      )}
      <CroppedFileInput ref={logoPickerRef} cropShape="square" onCropped={onLogoFile} isSaving={logoUploading} />
    </div>
  );
}
