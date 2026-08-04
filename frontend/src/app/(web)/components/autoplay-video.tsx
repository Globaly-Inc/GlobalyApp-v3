"use client";

import type { VideoHTMLAttributes } from "react";
import { useAutoplayVideo } from "../hooks/use-autoplay-video";

type Props = VideoHTMLAttributes<HTMLVideoElement> & { src: string };

export function AutoplayVideo({ src, children, ...rest }: Props) {
  const ref = useAutoplayVideo();
  return (
    <video ref={ref} autoPlay muted loop playsInline preload="metadata" {...rest}>
      <source src={src} type="video/mp4" />
      {children}
    </video>
  );
}
