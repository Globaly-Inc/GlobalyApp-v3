"use client";

import { useEffect, useState } from "react";
import { greeting } from "../utils";
import type { OnboardingProgress } from "../../apis/types";

function ProgressRing({ value, total }: Readonly<{ value: number; total: number }>) {
  const pct = total > 0 ? value / total : 0;
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90 shrink-0">
      <circle cx="20" cy="20" r={radius} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="4" />
      <circle
        cx="20" cy="20" r={radius} fill="none" stroke="white" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)}
        style={{ transition: "stroke-dashoffset 0.4s ease" }}
      />
    </svg>
  );
}

/**
 * The portal home's hero — a greeting plus how far along the onboarding checklist is, so the
 * capsule on the right always names the single next thing to do. The clock/weather/timezone hero
 * that used to live here moved to /business/social (2026-09-23); this one's whole job is pointing
 * at the checklist below it, not filling the banner with unrelated widgets.
 */
export function PortalHero({
  orgName,
  progress,
}: Readonly<{ orgName: string; progress: OnboardingProgress | null }>) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const nextStep = progress?.steps.find((s) => !s.done);

  return (
    <section
      aria-label="Welcome"
      className="relative overflow-hidden rounded-xl px-5 py-6 text-white shadow-lg md:px-8 md:py-8"
      style={{ background: "var(--gradient-primary)" }}
    >
      {/* Soft light from the top right, as on GlobalyOS-V2's greeting card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_85%_0%,rgb(255_255_255/0.14),transparent_60%),radial-gradient(40%_80%_at_0%_100%,rgb(255_255_255/0.06),transparent_70%)]"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/objects/sparkle.webp"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -top-3 right-[22rem] hidden size-28 -rotate-6 object-contain opacity-90 drop-shadow-[0_18px_24px_rgb(0_0_0/0.35)] lg:block"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/objects/campus.webp"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -bottom-6 right-[17rem] hidden size-24 object-contain opacity-55 blur-[1px] lg:block"
      />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-2xl text-white md:text-[1.75rem]">
            {mounted ? greeting(new Date().getHours()) : "Hello"}, {orgName || "there"}
          </h1>
          <p className="text-sm text-white/75 md:text-base">
            Let&apos;s get your AI assistant ready to answer students — it takes about 15 minutes.
          </p>
        </div>

        {progress && progress.completed < progress.total && (
          <a
            href="#get-set-up"
            className="flex shrink-0 items-center gap-3 rounded-xl bg-white/10 py-3 pl-3 pr-5 ring-1 ring-inset ring-white/15 backdrop-blur-sm transition-colors hover:bg-white/15"
          >
            <ProgressRing value={progress.completed} total={progress.total} />
            <div className="text-left">
              <p className="text-sm font-semibold text-white">
                {progress.completed} of {progress.total} steps done
              </p>
              {nextStep && <p className="text-xs text-white/70">Next: {nextStep.label}</p>}
            </div>
          </a>
        )}
      </div>
    </section>
  );
}
