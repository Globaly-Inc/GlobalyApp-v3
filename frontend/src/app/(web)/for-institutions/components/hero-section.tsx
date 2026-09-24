"use client";

import { MEDIA_URL } from "../../const/index";
import { AutoplayVideo } from "../../components/autoplay-video";
import { UnifiedSearchBar } from "../../components/unified-search-bar";
import { useTypingEffect } from "../../hooks/use-typing-effect";
import { INSTITUTION_TYPING_PHRASES } from "../static/for-institutions-content";

export function HeroSection() {
  const { displayText, showCursor } = useTypingEffect(INSTITUTION_TYPING_PHRASES);

  return (
    <section className="relative flex items-center overflow-hidden pt-8 pb-4 md:pt-11 md:pb-8">
      <AutoplayVideo
        src={`${MEDIA_URL}/institutions-hero.mp4`}
        poster={`${MEDIA_URL}/institutions-hero-poster.webp`}
        className="absolute inset-0 h-full w-full object-cover object-top"
        aria-hidden="true"
        tabIndex={-1}
      />
      {/* The same two layers as the home hero: a dark scrim that carries the white type, and a
          2px frost behind the copy alone. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-stone-950/62 via-stone-950/48 to-stone-950/68"
      />
      <div aria-hidden="true" className="hero-copy-blur pointer-events-none absolute inset-0" />
      <div className="container mx-auto px-4 py-8 sm:py-12 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white shadow-xs backdrop-blur animate-fade-in">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-white animate-ai-pulse" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            For Institutions
          </div>
          <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-extrabold text-white leading-[1.05] animate-fade-up">
            Expand Your Global
            <br />
            <span className="text-amber-300 inline-block min-h-[1.2em]">
              {displayText}
              <span
                className="text-amber-200"
                style={{ opacity: showCursor ? 1 : 0, transition: "opacity 0.1s" }}
              >
                |
              </span>
            </span>
          </h1>
          <p className="mt-5 mb-8 mx-auto max-w-2xl text-base sm:text-lg font-medium text-white/85 animate-fade-up">
            Join Globalyapp&apos;s AI-powered education marketplace built for institutions like
            yours. Manage your course listings, expand your education counselor network, and enroll more
            students — all in one smart, transparent platform.
          </p>
          <div className="animate-fade-up">
            <UnifiedSearchBar defaultTabSlug="institutions" />
          </div>
        </div>
      </div>
    </section>
  );
}
