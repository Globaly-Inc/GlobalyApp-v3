"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

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
  cropShape?: "circle" | "square";
  isSaving?: boolean;
}>) {
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

  const canvasSize = 280;
  const cropSize = 260;

  useEffect(() => {
    if (!open || !imageSrc) return;

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;

      const baseScale = Math.min(canvasSize / img.width, canvasSize / img.height);
      const scaledSize = Math.min(img.width, img.height) * baseScale;
      const zoomToFillCrop = cropSize / scaledSize;
      const calculatedFitZoom = Math.max(1, zoomToFillCrop);

      setFitZoom(calculatedFitZoom);
      setZoom(calculatedFitZoom);
      setPosition({ x: 0, y: 0 });
      setImageLoaded(true);
    };
    img.src = imageSrc;

    return () => setImageLoaded(false);
  }, [imageSrc, open]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = imageRef.current;
    if (!canvas || !ctx || !img) return;

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    const scale = Math.min(canvasSize / img.width, canvasSize / img.height) * zoom;
    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;

    const x = (canvasSize - scaledWidth) / 2 + position.x;
    const y = (canvasSize - scaledHeight) / 2 + position.y;

    ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();

    const cropX = (canvasSize - cropSize) / 2;
    const cropY = (canvasSize - cropSize) / 2;

    if (cropShape === "circle") {
      ctx.arc(canvasSize / 2, canvasSize / 2, cropSize / 2, 0, Math.PI * 2);
    } else {
      ctx.rect(cropX, cropY, cropSize, cropSize);
    }
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (cropShape === "circle") {
      ctx.arc(canvasSize / 2, canvasSize / 2, cropSize / 2, 0, Math.PI * 2);
    } else {
      ctx.rect(cropX, cropY, cropSize, cropSize);
    }
    ctx.stroke();
  }, [zoom, position, cropShape]);

  useEffect(() => {
    if (imageLoaded) drawCanvas();
  }, [imageLoaded, drawCanvas]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handlePointerUp = () => setIsDragging(false);

  const handleReset = () => {
    setZoom(fitZoom);
    setPosition({ x: 0, y: 0 });
  };

  const handleCrop = () => {
    const img = imageRef.current;
    if (!img) return;

    const outputCanvas = document.createElement("canvas");
    const outputSize = 400;
    outputCanvas.width = outputSize;
    outputCanvas.height = outputSize;
    const ctx = outputCanvas.getContext("2d");
    if (!ctx) return;

    const scale = Math.min(canvasSize / img.width, canvasSize / img.height) * zoom;
    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;

    const imgX = (canvasSize - scaledWidth) / 2 + position.x;
    const imgY = (canvasSize - scaledHeight) / 2 + position.y;

    const cropX = (canvasSize - cropSize) / 2;
    const cropY = (canvasSize - cropSize) / 2;

    const srcX = (cropX - imgX) / scale;
    const srcY = (cropY - imgY) / scale;
    const srcSize = cropSize / scale;

    if (cropShape === "circle") {
      ctx.beginPath();
      ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    }

    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, outputSize, outputSize);

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
          <div className="relative cursor-move overflow-hidden rounded-lg bg-muted" style={{ width: canvasSize, height: canvasSize }}>
            <canvas
              ref={canvasRef}
              width={canvasSize}
              height={canvasSize}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="touch-none"
            />
          </div>

          <div className="flex w-full items-center gap-3">
            <ZoomOut className="h-4 w-4 text-muted-foreground" />
            <Slider value={zoom} onValueChange={setZoom} min={effectiveMinZoom} max={effectiveMaxZoom} step={0.01} className="flex-1" />
            <ZoomIn className="h-4 w-4 text-muted-foreground" />
            <Button variant="outline" size="icon" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">Drag to reposition</p>
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
