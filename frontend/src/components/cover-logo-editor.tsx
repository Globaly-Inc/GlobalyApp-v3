"use client";

import { useRef, type ChangeEvent } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
}: Readonly<{
  coverUrl?: string | null;
  onCoverFile?: (file: File) => void;
  coverUploading?: boolean;
  logoUrl: string | null;
  logoFallback: string;
  onLogoFile: (file: File) => void;
  logoUploading?: boolean;
  className?: string;
}>) {
  const coverInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handlePick = (onFile: (file: File) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onFile(file);
  };

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
            onClick={() => coverInputRef.current?.click()}
          >
            {coverUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Edit cover
          </Button>
          <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={handlePick(onCoverFile)} />
        </>
      )}

      <button
        type="button"
        className="group absolute -bottom-12 left-6 cursor-pointer"
        onClick={() => logoInputRef.current?.click()}
        aria-label="Edit logo"
      >
        <Avatar className="size-24 border-4 border-background">
          {logoUrl && <AvatarImage src={logoUrl} alt="" />}
          <AvatarFallback className="text-2xl">{logoFallback}</AvatarFallback>
        </Avatar>
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
          {logoUploading ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
        </span>
      </button>
      <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={handlePick(onLogoFile)} />
    </div>
  );
}
