"use client";

// Canvas-based crop dialog — drag to reposition, slider to zoom, outputs a PNG blob.
// Ported from V1's ImageCropper: pure client-side canvas manipulation, no backend coupling.

import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

type CropShape = "circle" | "square" | "cover";
const DIMENSIONS: Record<CropShape, { canvasW: number; canvasH: number; cropW: number; cropH: number; outputW: number; outputH: number }> = {
  circle: { canvasW: 280, canvasH: 280, cropW: 260, cropH: 260, outputW: 400, outputH: 400 },
  square: { canvasW: 280, canvasH: 280, cropW: 260, cropH: 260, outputW: 400, outputH: 400 },
  cover: { canvasW: 460, canvasH: 140, cropW: 440, cropH: 88, outputW: 1500, outputH: 300 },
};

export function ImageCropper({
  open,
  onOpenChange,
  imageSrc,
  onCropComplete,
  cropShape = "circle",
  isSaving = false,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => void;
  cropShape?: CropShape;
  isSaving?: boolean;
}>) {
  const { canvasW, canvasH, cropW, cropH, outputW, outputH } = DIMENSIONS[cropShape];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);

  const effectiveMinZoom = fitZoom * 0.7;
  const effectiveMaxZoom = fitZoom * 1.7;

  useEffect(() => {
    if (!open || !imageSrc) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      const baseScale = Math.min(canvasW / img.width, canvasH / img.height);
      const scaledW = img.width * baseScale;
      const scaledH = img.height * baseScale;
      const zoomToFillCrop = Math.max(cropW / scaledW, cropH / scaledH);
      const calculatedFitZoom = Math.max(1, zoomToFillCrop);
      setFitZoom(calculatedFitZoom);
      setZoom(calculatedFitZoom);
      setPosition({ x: 0, y: 0 });
      setImageLoaded(true);
    };
    img.src = imageSrc;

    return () => setImageLoaded(false);
  }, [imageSrc, open, canvasW, canvasH, cropW, cropH]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = imageRef.current;
    if (!canvas || !ctx || !img) return;

    ctx.clearRect(0, 0, canvasW, canvasH);

    const scale = Math.min(canvasW / img.width, canvasH / img.height) * zoom;
    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;
    const x = (canvasW - scaledWidth) / 2 + position.x;
    const y = (canvasH - scaledHeight) / 2 + position.y;
    ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    const cropX = (canvasW - cropW) / 2;
    const cropY = (canvasH - cropH) / 2;
    if (cropShape === "circle") {
      ctx.arc(canvasW / 2, canvasH / 2, cropW / 2, 0, Math.PI * 2);
    } else {
      ctx.rect(cropX, cropY, cropW, cropH);
    }
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (cropShape === "circle") {
      ctx.arc(canvasW / 2, canvasH / 2, cropW / 2, 0, Math.PI * 2);
    } else {
      ctx.rect(cropX, cropY, cropW, cropH);
    }
    ctx.stroke();
  }, [zoom, position, cropShape, canvasW, canvasH, cropW, cropH]);

  useEffect(() => {
    if (imageLoaded) drawCanvas();
  }, [imageLoaded, drawCanvas]);

  const handlePointerDown = (clientX: number, clientY: number) => {
    setIsDragging(true);
    setDragStart({ x: clientX - position.x, y: clientY - position.y });
  };
  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    setPosition({ x: clientX - dragStart.x, y: clientY - dragStart.y });
  };

  const handleReset = () => {
    setZoom(fitZoom);
    setPosition({ x: 0, y: 0 });
  };

  const handleCrop = () => {
    const img = imageRef.current;
    if (!img) return;

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = outputW;
    outputCanvas.height = outputH;
    const ctx = outputCanvas.getContext("2d");
    if (!ctx) return;

    const scale = Math.min(canvasW / img.width, canvasH / img.height) * zoom;
    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;
    const imgX = (canvasW - scaledWidth) / 2 + position.x;
    const imgY = (canvasH - scaledHeight) / 2 + position.y;
    const cropX = (canvasW - cropW) / 2;
    const cropY = (canvasH - cropH) / 2;
    const srcX = (cropX - imgX) / scale;
    const srcY = (cropY - imgY) / scale;
    const srcW = cropW / scale;
    const srcH = cropH / scale;

    if (cropShape === "circle") {
      ctx.beginPath();
      ctx.arc(outputW / 2, outputH / 2, outputW / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    }

    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outputW, outputH);
    outputCanvas.toBlob((blob) => {
      if (blob) onCropComplete(blob);
    }, "image/png", 0.95);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crop Image</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div
            className="relative cursor-move overflow-hidden rounded-lg bg-muted"
            style={{ width: canvasW, height: canvasH }}
          >
            <canvas
              ref={canvasRef}
              width={canvasW}
              height={canvasH}
              onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
              onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
              onTouchStart={(e) => handlePointerDown(e.touches[0]!.clientX, e.touches[0]!.clientY)}
              onTouchMove={(e) => handlePointerMove(e.touches[0]!.clientX, e.touches[0]!.clientY)}
              onTouchEnd={() => setIsDragging(false)}
              className="touch-none"
            />
          </div>

          <div className="flex w-full items-center gap-3">
            <ZoomOut className="h-4 w-4 text-muted-foreground" />
            <Slider
              value={zoom}
              onValueChange={(v) => setZoom(v as number)}
              min={effectiveMinZoom}
              max={effectiveMaxZoom}
              step={0.01}
              className="flex-1"
            />
            <ZoomIn className="h-4 w-4 text-muted-foreground" />
            <Button variant="outline" size="icon" onClick={handleReset} type="button">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">Drag to reposition, use the slider to zoom.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleCrop} disabled={isSaving}>
            {isSaving ? "Saving..." : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
