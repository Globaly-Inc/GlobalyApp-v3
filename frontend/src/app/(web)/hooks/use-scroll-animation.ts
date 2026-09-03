"use client";

import { useEffect, useRef, useState } from "react";

export function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // animate once
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible } as const;
}

export function useParallax(speed = 0.25) {
  const ref = useRef<HTMLElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ticking = false;
    let isInView = false;

    const onScroll = () => {
      if (!isInView || ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const node = ref.current;
        if (node) {
          const rect = node.getBoundingClientRect();
          const center = rect.top + rect.height / 2 - window.innerHeight / 2;
          // ponytail: bound travel to +/- (height * speed / 2) so the paired scale(1 + speed)
          // always covers it and the media can never slip out of its card
          const progress = Math.max(-1, Math.min(1, center / ((window.innerHeight + rect.height) / 2)));
          setOffset((progress * rect.height * speed) / 2);
        }
        ticking = false;
      });
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        isInView = !!entry?.isIntersecting;
        if (isInView) {
          window.addEventListener("scroll", onScroll, { passive: true });
          onScroll();
        } else {
          window.removeEventListener("scroll", onScroll);
        }
      },
      { rootMargin: "100px" },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [speed]);

  return { ref, transform: `translateY(${offset}px) scale(${1 + speed})` } as const;
}
