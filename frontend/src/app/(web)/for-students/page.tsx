"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MEDIA_URL } from "../const/index";
import { Reveal } from "../components/reveal";
import { AutoplayVideo } from "../components/autoplay-video";
import { UnifiedSearchBar } from "../components/unified-search-bar";
import { useTypingEffect } from "../hooks/use-typing-effect";
import { getFeaturedCountries } from "../data/countries-api";
import type { Destination } from "../data/destinations";
import { getEducationAgencies, getInstitutions } from "../search/api";
import type { SearchBusiness } from "../search/types";
import { LatestBlogSection } from "../components/latest-blog-section";
import { DestinationsCarousel } from "./components/destinations-carousel";
import { InstitutionsCarousel } from "./components/institutions-carousel";
import { HowItWorks } from "./components/how-it-works";
import { AgentsCarousel } from "./components/agents-carousel";
import { STUDENT_TYPING_PHRASES } from "./static-content";

export default function ForStudentsPage() {
  const { displayText, showCursor } = useTypingEffect(STUDENT_TYPING_PHRASES);

  const [countries, setCountries] = useState<Destination[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [institutions, setInstitutions] = useState<SearchBusiness[]>([]);
  const [institutionsLoading, setInstitutionsLoading] = useState(true);
  const [agents, setAgents] = useState<SearchBusiness[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    getFeaturedCountries()
      .then((data) => setCountries(data.slice(0, 10)))
      .catch(() => {})
      .finally(() => setCountriesLoading(false));

    getInstitutions({})
      .then((res) => setInstitutions(res.data.slice(0, 10)))
      .catch(() => {})
      .finally(() => setInstitutionsLoading(false));

    getEducationAgencies({})
      .then((res) => setAgents(res.data.slice(0, 8)))
      .catch(() => {})
      .finally(() => setAgentsLoading(false));
  }, []);

  return (
    <>
      {/* ── 1. HERO ─────────────────────────────────────────────────────── */}
      <section className="relative flex items-center overflow-hidden pt-8 pb-4 md:pt-11 md:pb-8">
        <AutoplayVideo
          src={`${MEDIA_URL}/students-hero.mp4`}
          poster={`${MEDIA_URL}/students-hero-poster.webp`}
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
              For Students
            </div>
            <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-extrabold text-white leading-[1.05] animate-fade-up">
              Your Education Journey
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
              Find your perfect education destination and step into a world of possibilities
            </p>
            <div className="animate-fade-up">
              <UnifiedSearchBar />
            </div>
          </div>
        </div>
      </section>

      <DestinationsCarousel countries={countries} loading={countriesLoading} />
      <InstitutionsCarousel institutions={institutions} loading={institutionsLoading} />
      <HowItWorks />
      <AgentsCarousel agents={agents} loading={agentsLoading} />
      <LatestBlogSection subtitle="Expert insights on international education and student success." />

      {/* ── 7. CTA BANNER ───────────────────────────────────────────────── */}
      <section className="py-20 bg-[hsl(var(--purple-dark))] text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(var(--gold))]/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />

        <div className="container relative mx-auto px-4 text-center z-10">
          <Reveal>
            <h2 className="text-3xl md:text-4xl font-bold mb-6 leading-tight">Your Education Journey Begins Today.</h2>
            <p className="text-white/70 text-lg mb-10 max-w-2xl mx-auto">
              Join thousands of students who have already found their perfect education path with Globalyapp. Start
              your journey for free.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="btn-gold h-11 rounded-full px-10" render={<Link href="/auth/sign-up" />}>
                Join for Free
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-11 rounded-full px-10 bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white"
                render={<Link href="/search" />}
              >
                Explore Courses
              </Button>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
