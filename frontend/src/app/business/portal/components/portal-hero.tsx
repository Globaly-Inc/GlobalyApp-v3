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
    <section className="rounded-xl bg-gradient-to-br from-primary via-primary to-primary/70 px-4 py-5 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-xl font-bold text-primary-foreground md:text-2xl">
            {mounted ? greeting(new Date().getHours()) : "Hello"}, {orgName || "there"}
          </h1>
          <p className="text-sm text-primary-foreground/80">
            Let&apos;s get your AI assistant ready to answer students — it takes about 15 minutes.
          </p>
        </div>

        {progress && progress.completed < progress.total && (
          <a
            href="#get-set-up"
            className="flex shrink-0 items-center gap-3 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15 transition-colors hover:bg-white/15"
          >
            <ProgressRing value={progress.completed} total={progress.total} />
            <div className="text-left">
              <p className="text-sm font-semibold text-primary-foreground">
                {progress.completed} of {progress.total} steps done
              </p>
              {nextStep && <p className="text-xs text-primary-foreground/70">Next: {nextStep.label}</p>}
            </div>
          </a>
        )}
      </div>
    </section>
  );
}
