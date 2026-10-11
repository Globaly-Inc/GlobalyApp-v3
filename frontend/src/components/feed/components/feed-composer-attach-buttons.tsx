"use client";

import { Image as ImageIcon, Loader2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FeedComposerAttachButtons({
  uploading,
  setExpanded,
  imageInput,
  videoInput,
}: Readonly<{
  uploading: boolean;
  setExpanded: (value: boolean) => void;
  imageInput: React.RefObject<HTMLInputElement | null>;
  videoInput: React.RefObject<HTMLInputElement | null>;
}>) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 rounded-full text-muted-foreground"
        disabled={uploading}
        onClick={() => {
          setExpanded(true);
          imageInput.current?.click();
        }}
      >
        <ImageIcon className="h-4 w-4 text-success" /> Image
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 rounded-full text-muted-foreground"
        disabled={uploading}
        onClick={() => {
          setExpanded(true);
          videoInput.current?.click();
        }}
      >
        <Video className="h-4 w-4 text-info" /> Video
      </Button>
      {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}
