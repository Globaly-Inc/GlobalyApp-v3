"use client";

import { useTypingEffect } from "../../hooks/use-typing-effect";

const AUDIENCE_PHRASES = ["For Students", "For Institutions", "For Education Counselors"];

export function BlogHeroHeading() {
  const { displayText, showCursor } = useTypingEffect(AUDIENCE_PHRASES);

  return (
    <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-foreground mb-5 leading-[1.05]">
      Insights on Domestic &<br className="hidden md:block" /> International Education <br></br>
      <span className="text-primary inline-block min-h-[1.2em]">
        {displayText}
        <span
          className="text-[hsl(var(--primary-bright))]"
          style={{ opacity: showCursor ? 1 : 0, transition: "opacity 0.1s" }}
        >
          |
        </span>
      </span>
    </h1>
  );
}

