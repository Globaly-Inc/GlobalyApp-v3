"use client";

import { useTypingEffect } from "../../hooks/use-typing-effect";

const AUDIENCE_PHRASES = ["For Students", "For Institutions", "For Education Counselors"];

export function BlogHeroHeading() {
  const { displayText, showCursor } = useTypingEffect(AUDIENCE_PHRASES);

  return (
    <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-5 leading-[1.1] tracking-tight">
      Insights on Domestic &<br className="hidden md:block" /> International Education <br></br>
      <span className="text-primary inline-block min-h-[1.2em]">
        {displayText}
        <span style={{ opacity: showCursor ? 1 : 0, transition: "opacity 0.1s" }}>|</span>
      </span>
    </h1>
  );
}

