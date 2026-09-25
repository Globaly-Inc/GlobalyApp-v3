"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MOTION } from "@/lib/imagery";
import { useInView, usePrefersReducedMotion } from "@/hooks/use-reveal";
import { useThemeValue } from "./theme";

/**
 * The aurora behind the hero and the close.
 *
 * Two clips, one per theme, because a single one cannot work in both: pastel
 * blobs on white disappear on a near-black page, and a lit blob on black is a
 * grey smear on a white one. Switching theme swaps the source, and the poster
 * underneath covers the moment before the new file has decoded.
 *
 * It is a background, so it is treated like one: nothing is fetched until it
 * is near the viewport, it pauses when it leaves, and a visitor who has asked
 * for reduced motion gets the still frame and no video element at all.
 */
export function Aurora({
  className,
  force,
}: Readonly<{ className?: string; force?: "light" | "dark" }>) {
  const theme = useThemeValue();
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>("200px");
  const videoRef = useRef<HTMLVideoElement>(null);
  // Which source is decoded, rather than a boolean. A theme swap changes the
  // clip, and a boolean would leave the new file's first frame hidden behind
  // a stale "ready" until it happened to fire again.
  const [readySrc, setReadySrc] = useState<string | null>(null);

  // `force` pins the clip for a section that is dark in both themes.
  const clip = (force ?? theme) === "dark" ? MOTION.auroraDark : MOTION.auroraLight;
  const ready = readySrc === clip.src;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (inView) void video.play().catch(() => {});
    else video.pause();
  }, [inView, clip.src]);

  return (
    <div ref={ref} aria-hidden="true" className={cn("pointer-events-none overflow-hidden", className)}>
      <Image
        src={clip.poster}
        alt=""
        width={clip.width}
        height={clip.height}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {!reduced && (
        <video
          key={clip.src}
          ref={videoRef}
          src={clip.src}
          poster={clip.poster}
          muted
          loop
          playsInline
          preload="none"
          onCanPlay={() => setReadySrc(clip.src)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
            ready ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}
