"use client";

import { useEffect, useRef } from "react";

export function useAutoplayVideo<T extends HTMLVideoElement = HTMLVideoElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.muted = true;
    el.defaultMuted = true;
    el.setAttribute("muted", "");
    el.playsInline = true;

    let loaded = false;
    const tryPlay = () => {
      el.play().catch(() => {});
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!loaded) {
              loaded = true;
              el.preload = "auto";
              try {
                el.load();
              } catch {}
            }
            tryPlay();
          } else {
            try {
              el.pause();
            } catch {}
          }
        }
      },
      { rootMargin: "200px", threshold: 0.01 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return ref;
}
