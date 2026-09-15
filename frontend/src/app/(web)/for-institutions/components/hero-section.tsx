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
      {/* The same four layers as the home hero: a light wash in the page background, two blurred
          brand blooms that imply a light source, and a 2px frost behind the copy alone. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-background/35 via-background/15 to-background/55"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[hsl(var(--primary)/0.10)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-24 h-[380px] w-[380px] rounded-full bg-[hsl(var(--primary-bright)/0.10)] blur-3xl"
      />
      <div aria-hidden="true" className="hero-copy-blur pointer-events-none absolute inset-0" />
      <div className="container mx-auto px-4 py-8 sm:py-12 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card/70 px-4 py-1.5 text-xs font-semibold text-primary shadow-xs backdrop-blur animate-fade-in">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary animate-ai-pulse" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            For Institutions
          </div>
          <h1 className="mt-6 font-display text-4xl sm:text-5xl md:text-6xl font-extrabold text-foreground leading-[1.05] animate-fade-up">
            Expand Your Global
            <br />
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
          <p className="mt-5 mb-8 mx-auto max-w-2xl text-base sm:text-lg font-medium text-foreground animate-fade-up">
            Join Globalyapp&apos;s AI-powered education marketplace built for institutions like
            yours. Manage your course listings, expand your education counselor network, and enroll more
            students — all in one smart, transparent platform.
          </p>
          <div className="animate-fade-up">
            <UnifiedSearchBar tone="light" defaultTabSlug="institutions" />
          </div>
        </div>
      </div>
    </section>
  );
}
