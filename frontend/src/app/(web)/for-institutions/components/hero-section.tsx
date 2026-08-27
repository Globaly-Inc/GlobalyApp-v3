"use client";

import { MEDIA_URL } from "../../const/index";
import { Badge } from "@/components/ui/badge";
import { AutoplayVideo } from "../../components/autoplay-video";
import { UnifiedSearchBar } from "../../components/unified-search-bar";
import { useTypingEffect } from "../../hooks/use-typing-effect";
import { INSTITUTION_TYPING_PHRASES } from "../static/for-institutions-content";

export function HeroSection() {
  const { displayText, showCursor } = useTypingEffect(INSTITUTION_TYPING_PHRASES);

  return (
    <section className="relative min-h-[calc(100svh-64px)] md:min-h-[620px] flex items-center overflow-hidden">
      <AutoplayVideo
        src={`${MEDIA_URL}/institutions-hero.mp4`}
        poster={`${MEDIA_URL}/institutions-hero-poster.webp`}
        className="absolute inset-0 w-full h-full object-cover scale-105"
        style={{ transformOrigin: "center" }}
      />
      <div className="absolute inset-0 bg-[hsl(var(--purple-dark))]/80" />
      <div className="container relative mx-auto px-4 py-16 md:py-20 z-10">
        <div className="max-w-4xl mx-auto text-center py-8 md:py-[50px] pb-[20px] pt-[60px]">
          <Badge className="mb-4 bg-[hsl(var(--gold))]/20 text-[hsl(var(--gold))] border-[hsl(var(--gold))]/30 text-xs font-semibold px-3 py-1 rounded-full">
            For Institutions
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
            Expand Your Global
            <br />
            <span className="text-[hsl(var(--gold))] inline-block min-h-[1.2em]">
              {displayText}
              <span style={{ opacity: showCursor ? 1 : 0, transition: "opacity 0.1s" }}>|</span>
            </span>
          </h1>
          <p className="text-white/80 text-base mb-8 max-w-2xl mx-auto">
            Join Globaly.app&apos;s AI-powered education marketplace built for institutions like
            yours. Manage your course listings, expand your agent network, and enroll more
            students — all in one smart, transparent platform.
          </p>
          <UnifiedSearchBar />
        </div>
      </div>
    </section>
  );
}
