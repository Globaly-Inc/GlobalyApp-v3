"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProfileSection } from "./profile-section";

export type GalleryItem = { type: "image" | "video" | "embed"; url: string };

/* Span patterns that give the 3+ layout its masonry feel — ported from V1's ServiceMediaCarousel. */
const SPAN_PATTERNS: Record<number, string[]> = {
  3: ["col-span-1 row-span-2", "col-span-1 row-span-1", "col-span-1 row-span-1"],
  4: ["col-span-1 row-span-2", "col-span-1 row-span-1", "col-span-1 row-span-1", "col-span-2 row-span-1"],
};

function spanClass(index: number, total: number) {
  const pattern = SPAN_PATTERNS[Math.min(total, 4)];
  return pattern ? pattern[index % pattern.length] ?? "" : "";
}

function Media({ item, className }: Readonly<{ item: GalleryItem; className?: string }>) {
  if (item.type === "video") {
     
    return <video src={item.url} controls className={className} />;
  }
  if (item.type === "embed") {
    return <iframe src={item.url} title="Institution video" allow="autoplay; fullscreen" allowFullScreen className={className} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={item.url} alt="" loading="lazy" className={className} />;
}

/**
 * V1's Media Gallery: one or two items stack at their natural size, three or more fall into a
 * masonry grid whose last tile carries the "+N" overflow badge. Any tile opens the lightbox.
 */
export function ProfileGallery({ items }: Readonly<{ items: GalleryItem[] }>) {
  const [openAt, setOpenAt] = useState<number | null>(null);

  if (items.length === 0) return null;

  const naturalLayout = items.length <= 2;
  const visible = items.slice(0, naturalLayout ? 2 : 4);
  const extra = items.length - 4;
  const current = items[openAt ?? 0] ?? items[0]!;

  return (
    <ProfileSection icon={ImageIcon} title="Media Gallery" count={items.length}>
      <div
        className={cn(
          "overflow-hidden rounded-lg",
          naturalLayout ? "flex flex-col gap-1.5" : "grid auto-rows-[140px] grid-cols-2 gap-1.5",
        )}
      >
        {visible.map((item, i) => (
          <button
            key={item.url}
            type="button"
            onClick={() => setOpenAt(i)}
            className={cn(
              "group relative overflow-hidden rounded-md bg-muted",
              !naturalLayout && spanClass(i, items.length),
            )}
          >
            <Media
              item={item}
              className={cn(
                "w-full transition-transform duration-300 group-hover:scale-105",
                naturalLayout ? "object-contain" : "h-full object-cover",
              )}
            />
            {!naturalLayout && i === 3 && extra > 0 && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-bold text-white">
                +{extra}
              </span>
            )}
          </button>
        ))}
      </div>

      <Dialog open={openAt !== null} onOpenChange={(open) => !open && setOpenAt(null)}>
        <DialogContent className="max-h-[95vh] max-w-[95vw] border-0 bg-black/95 p-0">
          <DialogTitle className="sr-only">Institution media</DialogTitle>
          <div className="relative flex min-h-[60vh] items-center justify-center">
            <Button variant="ghost" size="icon" onClick={() => setOpenAt(null)} className="absolute right-4 top-4 z-50 text-white hover:bg-white/20">
              <X className="h-5 w-5" />
            </Button>

            {items.length > 1 && (
              <>
                <Button
                  variant="ghost" size="icon" aria-label="Previous"
                  onClick={() => setOpenAt((p) => ((p ?? 0) + items.length - 1) % items.length)}
                  className="absolute left-4 z-50 h-12 w-12 text-white hover:bg-white/20"
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
                <Button
                  variant="ghost" size="icon" aria-label="Next"
                  onClick={() => setOpenAt((p) => ((p ?? 0) + 1) % items.length)}
                  className="absolute right-4 z-50 h-12 w-12 text-white hover:bg-white/20"
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              </>
            )}

            <div className="flex w-full items-center justify-center p-4 sm:p-8">
              <Media item={current} className="mx-auto max-h-[80vh] w-auto max-w-full rounded-lg object-contain" />
            </div>

            {items.length > 1 && (
              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
                {items.map((item, i) => (
                  <button
                    key={item.url}
                    type="button"
                    aria-label={`Go to item ${i + 1}`}
                    onClick={() => setOpenAt(i)}
                    className={cn("h-2 w-2 rounded-full transition-colors", item === current ? "bg-white" : "bg-white/40")}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </ProfileSection>
  );
}
