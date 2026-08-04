"use client";

import { useState, useEffect } from "react";

export function useTypingEffect(
  phrases: string[],
  typingSpeed = 60,
  deletingSpeed = 35,
  pauseMs = 1400,
  gapMs = 400,
) {
  const [displayText, setDisplayText] = useState("");
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setShowCursor((v) => !v), 530);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let phraseIdx = 0;
    let charIdx = 0;
    let isDeleting = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      const current = phrases[phraseIdx] ?? "";
      if (!isDeleting) {
        charIdx++;
        setDisplayText(current.slice(0, charIdx));
        if (charIdx >= current.length) {
          isDeleting = true;
          timeoutId = setTimeout(tick, pauseMs);
        } else {
          timeoutId = setTimeout(tick, typingSpeed);
        }
      } else {
        charIdx--;
        setDisplayText(current.slice(0, charIdx));
        if (charIdx <= 0) {
          isDeleting = false;
          phraseIdx = (phraseIdx + 1) % phrases.length;
          timeoutId = setTimeout(tick, gapMs);
        } else {
          timeoutId = setTimeout(tick, deletingSpeed);
        }
      }
    };

    timeoutId = setTimeout(tick, typingSpeed);
    return () => clearTimeout(timeoutId);
  }, [phrases, typingSpeed, deletingSpeed, pauseMs, gapMs]);

  return { displayText, showCursor } as const;
}
