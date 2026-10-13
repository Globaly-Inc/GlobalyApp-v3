"use client";

import { useSyncExternalStore } from "react";
import { ChevronRight } from "lucide-react";
import { HeroCard, HeroChip } from "@/components/ui/hero-card";
import { greeting } from "@/components/greeting-hero/utils";
import type { OnboardingProgress } from "../../apis/types";

function ProgressRing({ value, total }: Readonly<{ value: number; total: number }>) {
  const pct = total > 0 ? value / total : 0;
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width="44" height="44" viewBox="0 0 40 40" className="-rotate-90 shrink-0" aria-hidden>
      <circle cx="20" cy="20" r={radius} fill="none" stroke="currentColor" strokeOpacity={0.22} strokeWidth="4" />
      <circle
        cx="20" cy="20" r={radius} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)}
        style={{ transition: "stroke-dashoffset 0.4s ease" }}
      />
    </svg>
  );
}

const noopSubscribe = () => () => {};

/**
 * The portal home's hero — a greeting plus how far along the onboarding checklist is, so the
 * capsule on the right always names the single next thing to do. The clock/weather/timezone hero
 * that used to live here moved to /business/social (2026-09-23); this one's whole job is pointing
 * at the checklist below it, not filling the banner with unrelated widgets.
 */
/**
 * The portal has three days: nothing started, the crawl running, the profile built. The banner says
 * which one it is and what is being asked of the owner on it — on the middle one, that is nothing.
 */
function headline(stage: PortalStage, orgName: string, hour: number | null) {
  if (stage === "extracting") {
    return {
      title: "We're reading your site now",
      detail: "Nothing for you to watch. While it runs, the one job that doesn't depend on it is putting your assistant live.",
    };
  }
  if (stage === "built") {
    return {
      title: "Your profile is built",
      detail: "One job left that only you can do: check that what we read is right.",
    };
  }
  return {
    title: `${hour === null ? "Hello" : greeting(hour)}, ${orgName || "there"}`,
    detail: "A few steps to a live AI assistant. Stop whenever you like — we keep your place.",
  };
}

export type PortalStage = "new" | "extracting" | "built";

export function PortalHero({
  orgName,
  progress,
  stage,
}: Readonly<{ orgName: string; progress: OnboardingProgress | null; stage: PortalStage }>) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const nextStep = progress?.steps.find((s) => !s.done);
  const { title, detail } = headline(stage, orgName, mounted ? new Date().getHours() : null);

  const capsule = progress && progress.completed < progress.total && (
    <>
      {/* The 3D objects sit just left of the capsule, so they only appear with it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/objects/sparkle.webp"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -top-3 right-[22rem] -z-10 hidden size-28 -rotate-6 object-contain opacity-90 drop-shadow-[0_18px_24px_rgb(0_0_0/0.35)] lg:block"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/objects/campus.webp"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -bottom-6 right-[17rem] -z-10 hidden size-24 object-contain opacity-55 blur-[1px] lg:block"
      />
      <a href="#get-set-up" className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
        <HeroChip className="gap-3 py-2.5 pl-2.5 pr-4 transition-colors group-hover:bg-white/15">
          <ProgressRing value={progress.completed} total={progress.total} />
          <span className="text-left">
            <span className="block text-sm font-semibold">
              {progress.completed} of {progress.total} steps done
            </span>
            {nextStep && <span className="mt-0.5 block text-xs text-white/70">Next: {nextStep.label}</span>}
          </span>
          <ChevronRight className="ml-1 size-4 shrink-0 opacity-70" aria-hidden />
        </HeroChip>
      </a>
    </>
  );

  return <HeroCard aria-label="Welcome" title={title} subtitle={detail} aside={capsule || undefined} />;
}
