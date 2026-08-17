"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ImageDropzone({
  value,
  onChange,
  onUpload,
  onDeferredPick,
  className,
}: Readonly<{
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  onUpload?: (file: File) => Promise<{ url: string }>;
  onDeferredPick?: (file: File, previewUrl: string) => void;
  className?: string;
}>) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = async (file: File) => {
    if (onDeferredPick) {
      if (value?.startsWith("blob:")) URL.revokeObjectURL(value);
      const previewUrl = URL.createObjectURL(file);
      onDeferredPick(file, previewUrl);
      onChange(previewUrl);
      return;
    }
    if (!onUpload) return;
    setUploading(true);
    try {
      const { url } = await onUpload(file);
      onChange(url);
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) pick(file);
    e.target.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) pick(file);
  };

  if (value) {
    return (
      <div className={cn("group relative h-40 w-full overflow-hidden rounded-lg border border-border bg-muted", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="" className="h-full w-full object-cover" />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 opacity-0 transition-opacity hover:bg-background group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      disabled={uploading}
      className={cn(
        "flex h-40 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-center transition-colors",
        dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
        className,
      )}
    >
      {uploading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <ImagePlus className="h-5 w-5 text-muted-foreground" />
      )}
      <p className="text-sm font-medium text-foreground">Click or drag files here</p>
      <p className="text-xs text-muted-foreground">Images supported</p>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
    </button>
  );
}
