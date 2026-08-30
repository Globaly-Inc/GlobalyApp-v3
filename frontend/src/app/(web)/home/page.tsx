"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MEDIA_URL } from "../const/index";
import { Reveal } from "../components/reveal";
import { AutoplayVideo } from "../components/autoplay-video";
import { UnifiedSearchBar } from "../components/unified-search-bar";
import { useTypingEffect } from "../hooks/use-typing-effect";
import { useParallax } from "../hooks/use-scroll-animation";
import { useIsMobile } from "../hooks/use-is-mobile";
import type { Destination } from "../data/destinations";
import { getFeaturedCountries } from "../data/countries-api";
import { BLOG_POSTS } from "../data/blog-posts";
import {
  TYPING_PHRASES,
  STUDENT_FEATURES,
  PROVIDER_FEATURES,
  AGENT_FEATURES,
  STATS,
} from "../static/home-content";

export default function HomePage() {
  const { displayText, showCursor } = useTypingEffect(TYPING_PHRASES);
  const { ref: parallax1Ref, transform: parallax1Transform } = useParallax(0.18);
  const { ref: parallax2Ref, transform: parallax2Transform } = useParallax(0.18);
  const { ref: parallax3Ref, transform: parallax3Transform } = useParallax(0.18);
  const isMobile = useIsMobile();
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destinationsLoading, setDestinationsLoading] = useState(true);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    getFeaturedCountries()
      .then((data) => setDestinations(data.slice(0, 8)))
      .catch(() => {})
      .finally(() => setDestinationsLoading(false));
  }, []);

  return (
    <>
      <section className="relative min-h-[calc(100svh-64px)] md:min-h-[620px] flex items-center overflow-hidden bg-[hsl(var(--purple-dark))]">
        <AutoplayVideo
          src="https://videos.pexels.com/video-files/7945680/7945680-hd_1920_1080_25fps.mp4"
          poster="https://images.pexels.com/photos/1205651/pexels-photo-1205651.jpeg?auto=compress&cs=tinysrgb&w=1920"
          className="absolute inset-0 w-full h-full object-cover scale-105"
          style={{ transformOrigin: "center" }}
        />
        <div className="absolute inset-0 bg-[hsl(var(--purple-dark))]/60" />
        <div className="container mx-auto px-4 py-16 sm:py-20 md:py-20 relative z-10">
          <div className="max-w-4xl mx-auto text-center py-8 md:py-[50px] pb-[20px] pt-[60px]">
            <p className="text-white/70 text-sm font-medium mb-2 tracking-wide">
              World #1 AI Integrated Education Ecosystem
            </p>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
              Making Global Education
              <br />
              <span className="text-[hsl(var(--gold))]">
                {displayText}
                <span
                  className="text-[hsl(var(--gold))]"
                  style={{ opacity: showCursor ? 1 : 0, transition: "opacity 0.1s" }}
                >
                  |
                </span>
              </span>
            </h1>
            <p className="text-white/80 mb-8 text-base sm:text-xl font-medium px-2">
              Connecting Students with Domestic and International Education Providers, Education
              Education Counselors and Service Providers
            </p>
            <UnifiedSearchBar />
          </div>
        </div>
      </section>

      {/* ── EXPLORE DESTINATIONS ── */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <Reveal>
            <h2 className="text-2xl font-bold mb-8">
              Explore Education <span className="highlight-text active">without Boundaries</span>
            </h2>
          </Reveal>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {destinationsLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="rounded-2xl" style={{ aspectRatio: "4/3" }} />
                ))
              : destinations.map((dest, idx) => (
                  <Reveal key={dest.id} delay={idx * 0.07}>
                    <Link
                      href={`/country/${dest.slug}`}
                      className="group relative overflow-hidden rounded-2xl block"
                      style={{ aspectRatio: "4/3" }}
                    >
                      {dest.heroImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={dest.heroImageUrl}
                          alt={dest.name}
                          className="absolute inset-0 w-full h-full object-cover md:transition-transform md:duration-700 md:group-hover:scale-110"
                          loading="lazy"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-muted flex items-center justify-center text-5xl">
                          {dest.flagEmoji}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10 transition-opacity duration-300 group-hover:opacity-90" />
                      <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-1 group-hover:translate-y-0 transition-transform duration-300">
                        <h3 className="font-bold text-white text-base md:text-lg leading-tight">
                          {dest.flagEmoji && <span className="mr-1">{dest.flagEmoji}</span>}
                          {dest.name}
                        </h3>
                      </div>
                    </Link>
                  </Reveal>
                ))}
          </div>
        </div>
      </section>

      {/* ── FOR STUDENTS ── */}
      <section className="py-16 bg-primary/5">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <Reveal direction="left">
              <div>
                <h2 className="text-3xl font-bold mb-4">
                  For <span className="gradient-text">Students</span>
                </h2>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  We believe access to the right education is everyone&apos;s right, and therefore,
                  access to accurate, first-hand information about your future education is crucial
                  for making important career decisions in your life. We make educational
                  information accessible and connect you with the right partners to enable your
                  educational journey
                </p>
                <div className="space-y-2.5 mb-8">
                  {STUDENT_FEATURES.map((feat) => (
                    <div key={feat} className="flex items-start gap-2.5">
                      <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-muted-foreground">{feat}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <Button
                    className="h-10 rounded-full px-6"
                    style={{ background: "hsl(var(--purple-dark))", color: "white" }}
                    nativeButton={false}
                    render={<Link href="/auth/sign-up" />}
                  >
                    Start Your Journey
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 rounded-full px-6"
                    nativeButton={false}
                    render={<Link href="/for-students" />}
                  >
                    Learn More
                  </Button>
                </div>
              </div>
            </Reveal>
            <Reveal direction="right" className="relative">
              <div ref={parallax1Ref as never} className="rounded-2xl shadow-xl overflow-hidden bg-muted" style={{ aspectRatio: "4/3" }}>
                <AutoplayVideo
                  src={`${MEDIA_URL}/students-hero.mp4`}
                  poster={`${MEDIA_URL}/students-hero-poster.webp`}
                  className="w-full h-full object-cover"
                  style={{ transform: isMobile ? undefined : parallax1Transform }}
                />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── BLOG ARTICLES ── */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <Reveal className="flex items-center justify-between mb-2">
            <div className="flex items-center justify-between w-full">
              <h3 className="text-lg font-semibold text-muted-foreground">
                Get help articles related to{" "}
                <span className="highlight-text active text-foreground">study, live and work</span>
              </h3>
              <Button
                variant="ghost"
                className="h-10 text-primary text-sm"
                nativeButton={false}
                render={<Link href="/blog" />}
              >
                Explore more <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            {BLOG_POSTS.map((post, i) => (
              <Reveal key={post.title} delay={i * 0.1}>
                <Link href={post.href} className="group block h-full">
                  <Card className="overflow-hidden h-full hover:shadow-md transition-all duration-300 hover:-translate-y-1 flex flex-row sm:flex-col">
                    <div className="w-32 shrink-0 sm:w-full aspect-square sm:aspect-[4/3] overflow-hidden bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={post.image}
                        alt={post.title}
                        className="w-full h-full object-cover md:transition-transform md:duration-700 md:group-hover:scale-110"
                        loading="lazy"
                      />
                    </div>
                    <CardContent className="p-3 sm:p-4 flex-1 min-w-0 flex flex-col justify-center sm:block">
                      <p className="text-xs text-muted-foreground mb-1.5">{post.date}</p>
                      <h3 className="font-semibold text-sm line-clamp-2 sm:line-clamp-3 mb-2 group-hover:text-primary transition-colors">
                        {post.title}
                      </h3>
                      <Badge variant="secondary" className="text-xs w-fit">
                        {post.category}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              </Reveal>
            ))}
          </div>
          <Reveal className="text-center mt-8">
            <Button
              variant="outline"
              className="h-10 rounded-full px-6"
              nativeButton={false}
              render={<Link href="/blog" />}
            >
              Explore more
            </Button>
          </Reveal>
        </div>
      </section>

      {/* ── FOR EDUCATION PROVIDERS ── */}
      <section className="py-16 bg-primary/5">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <Reveal direction="left" className="relative">
              <div ref={parallax2Ref as never} className="rounded-2xl shadow-xl overflow-hidden bg-muted" style={{ aspectRatio: "4/3" }}>
                <AutoplayVideo
                  src={`${MEDIA_URL}/institutions-hero.mp4`}
                  poster={`${MEDIA_URL}/institutions-hero-poster.webp`}
                  className="w-full h-full object-cover"
                  style={{ transform: isMobile ? undefined : parallax2Transform }}
                />
              </div>
            </Reveal>
            <Reveal direction="right">
              <div>
                <h2 className="text-3xl font-bold mb-4">
                  For <span className="gradient-text">Education Providers</span>
                </h2>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Showcase your course offerings to the global market without any limitation and
                  connect with the qualified students locally and internationally through reputed
                  and highly rated education counselors
                </p>
                <div className="space-y-2.5 mb-8">
                  {PROVIDER_FEATURES.map((feat) => (
                    <div key={feat} className="flex items-start gap-2.5">
                      <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-muted-foreground">{feat}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <Button
                    className="h-10 rounded-full px-6"
                    style={{ background: "hsl(var(--purple-dark))", color: "white" }}
                    nativeButton={false}
                    render={<Link href="/auth/sign-up" />}
                  >
                    Claim Your Profile
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 rounded-full px-6"
                    nativeButton={false}
                    render={<Link href="/for-institutions" />}
                  >
                    Learn More
                  </Button>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── GLOBAL STRATEGIES BANNER ── */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <Reveal className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">
              One Platform. <span className="highlight-text active">Global Reach.</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Whether you&apos;re a student, an institution, or an education counselor — Globaly.app connects you
              with the right people, at the right time.
            </p>
          </Reveal>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6">
            {STATS.map((s, i) => (
              <Reveal key={s.label} delay={i * 0.15}>
                <Card className="border-none shadow-none bg-muted/30 hover:bg-muted/50 transition-colors">
                  <CardContent className="p-6 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <s.icon className="h-6 w-6 text-primary" />
                    </div>
                    <p className="text-2xl font-bold mb-1">{s.value}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOR AGENTS ── */}
      <section className="py-16 bg-primary/5">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <Reveal direction="left">
              <div>
                <h2 className="text-3xl font-bold mb-4">
                  For <span className="gradient-text">Education Counselors</span>
                </h2>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Bridge the gap between students and institutions worldwide. Access verified
                  leads, connect with global providers, and grow your agency with our transparent,
                  commission-free marketplace.
                </p>
                <div className="space-y-2.5 mb-8">
                  {AGENT_FEATURES.map((feat) => (
                    <div key={feat} className="flex items-start gap-2.5">
                      <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-muted-foreground">{feat}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <Button
                    className="h-10 rounded-full px-6"
                    style={{ background: "hsl(var(--purple-dark))", color: "white" }}
                    nativeButton={false}
                    render={<Link href="/auth/sign-up" />}
                  >
                    Start Growing
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 rounded-full px-6"
                    nativeButton={false}
                    render={<Link href="/for-agents" />}
                  >
                    Learn More
                  </Button>
                </div>
              </div>
            </Reveal>
            <Reveal direction="right" className="relative">
              <div ref={parallax3Ref as never} className="rounded-2xl shadow-xl overflow-hidden bg-muted" style={{ aspectRatio: "4/3" }}>
                <AutoplayVideo
                  src={`${MEDIA_URL}/education counselors-hero.mp4`}
                  poster={`${MEDIA_URL}/education counselors-hero-poster.webp`}
                  className="w-full h-full object-cover"
                  style={{ transform: isMobile ? undefined : parallax3Transform }}
                />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-20 bg-[hsl(var(--purple-dark))] text-white">
        <div className="container mx-auto px-4">
          <Reveal className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to start your global journey?</h2>
            <p className="text-white/70 mb-10 text-lg">
              Join thousands of students, institutions, and education counselors already using Globaly.app to
              connect and grow.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="h-11 rounded-full px-10 btn-gold"
                nativeButton={false}
                render={<Link href="/auth/sign-up" />}
              >
                Create Free Account
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-11 rounded-full px-10 bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white"
                nativeButton={false}
                render={<Link href="/search" />}
              >
                Explore Marketplace
              </Button>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
