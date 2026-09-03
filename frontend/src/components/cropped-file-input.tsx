"use client";

// Hidden file input + ImageCropper dialog, bundled behind an imperative `pick()` — drop-in
// replacement for a bare <input type="file"> wherever an uploaded photo/logo/cover should be
// cropped first instead of uploaded raw. `adjust(url)` re-crops an already-uploaded image,
// routed through /api/image-proxy so it loads same-origin — canvas export needs to read the
// image's pixels, which the browser blocks for a cross-origin image unless its host sends CORS
// headers. A freshly picked file never hits this: it's already a same-origin blob: URL.

import { forwardRef, useImperativeHandle, useRef, useState, type ChangeEvent } from "react";
import { ImageCropper } from "@/components/image-cropper";

export type CroppedFileInputHandle = {
  pick: () => void;
  /** Re-open the cropper on an already-uploaded image instead of picking a new file. */
  adjust: (url: string) => void;
};

export const CroppedFileInput = forwardRef<
  CroppedFileInputHandle,
  Readonly<{
    cropShape?: "circle" | "square" | "cover";
    onCropped: (file: File) => void;
    isSaving?: boolean;
  }>
>(function CroppedFileInput({ cropShape = "square", onCropped, isSaving = false }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rawSrc, setRawSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    pick: () => inputRef.current?.click(),
    adjust: (url: string) => {
      setRawSrc(`/api/image-proxy?url=${encodeURIComponent(url)}`);
      setOpen(true);
    },
  }));

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setRawSrc(URL.createObjectURL(file));
    setOpen(true);
  };

  const handleCropComplete = (blob: Blob) => {
    onCropped(new File([blob], "image.png", { type: "image/png" }));
    setOpen(false);
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleChange} />
      {rawSrc && (
        <ImageCropper
          open={open}
          onOpenChange={setOpen}
          imageSrc={rawSrc}
          onCropComplete={handleCropComplete}
          cropShape={cropShape}
          isSaving={isSaving}
        />
      )}
    </>
  );
});
