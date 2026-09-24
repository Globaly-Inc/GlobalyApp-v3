"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/lib/site";
import { AlyOrb } from "@/components/site/aly-orb";
import { TypewriterWord } from "@/components/site/typewriter-word";
import { Aurora } from "./aurora";
import { CtaButton } from "./primitives";
import { ThemeToggle, useThemeValue } from "./theme";

/**
 * The nav. Glass, so the aurora moves underneath it, and it earns the blur by
 * being the only fixed element on the page.
 *
 * No section links (23 Sep 2026). What is left is the mark, the theme switch
 * and the one thing the page is asking for, which is also why there is no
 * longer a compact menu to open: with the links gone the drawer held nothing
 * but that button, so the button is simply always on the bar.
 */
export function Navbar() {
  const theme = useThemeValue();

  return (
    <header className="fixed inset-x-0 top-3 z-50 px-3 sm:px-5">
      <div className="v6-glass mx-auto flex h-16 max-w-[1300px] items-center justify-between gap-5 px-4 sm:px-5">
        <a href="#top" className="flex shrink-0 items-center" aria-label={`${siteConfig.name}, home`}>
          <Image
            src="/globalyai-logo.png"
            alt={siteConfig.name}
            width={1240}
            height={313}
            priority
            className={cn("h-[22px] w-auto transition-[filter] duration-300", theme === "dark" && "brightness-0 invert")}
          />
        </a>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <CtaButton size="sm" />
        </div>
      </div>
    </header>
  );
}

/**
 * Every kind of institution the counselor is for, named one at a time in the
 * headline. Singular throughout, because the word sits in "your _ website".
 */
const AUDIENCES = ["university", "institution", "college", "school"] as const;

/**
 * The hero, cut to four things on the CEO's call (23 Sep 2026), to match
 * variation 1: the orb, the sentence, one line under it, one button. Centered,
 * because with the panel gone there is nothing to sit beside.
 *
 * What went: the eyebrow, the standfirst, the "See how it works" link, and the
 * AskPanel. The panel is the real loss. It was this variation's whole
 * argument, three questions the visitor picks from and the assistant answers
 * with its sources cited, which is the product acted out rather than claimed.
 * <HowItWorks /> describes the same four moves two sections down, but it
 * describes them.
 *
 * The aurora and dot field stay. They are the ground this variation is built
 * on and they work in both themes.
 */
export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden px-3 pb-12 pt-24 sm:px-5 md:pb-16">
      <div aria-hidden="true" className="v6-hero-field pointer-events-none absolute inset-x-0 top-0 h-[46rem]" />
      <Aurora className="v6-aurora-hero absolute inset-x-0 top-0 h-[42rem] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
      <div aria-hidden="true" className="v6-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent_75%)]" />

      <div className="relative mx-auto flex min-h-[62vh] max-w-[1300px] items-center px-2 md:min-h-[68vh]">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <AlyOrb className="h-16 w-16 animate-fade-up" />

          <h1
            className="mt-8 text-[clamp(2.2rem,5.4vw,3.6rem)] leading-[1.08] animate-fade-up"
            style={{ animationDelay: "60ms" }}
          >
            Give your <TypewriterWord words={AUDIENCES} /> website{" "}
            <span className="v6-gradient-text">AI guidance</span>.
          </h1>

          <p
            className="mt-6 max-w-xl text-pretty text-[17px] leading-[1.6] text-[var(--body)] sm:text-[19px] animate-fade-up"
            style={{ animationDelay: "100ms" }}
          >
            Guides every student and parent, and converts more of them.
          </p>

          <div className="mt-10 animate-fade-up" style={{ animationDelay: "140ms" }}>
            <CtaButton size="lg" />
          </div>
        </div>
      </div>
    </section>
  );
}
