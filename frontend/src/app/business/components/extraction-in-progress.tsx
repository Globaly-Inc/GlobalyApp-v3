"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ExtractionStatus } from "../apis/types";

/** A browser window being read: page lines, a scan band sweeping down, sparkles. Theme colours only. */
function ExtractionIllustration() {
  return (
    <svg viewBox="0 0 240 180" className="h-44 w-auto text-primary" aria-hidden>
      <ellipse cx="120" cy="166" rx="84" ry="8" className="fill-muted" />
      <rect x="36" y="22" width="168" height="128" rx="12" className="fill-card stroke-border" strokeWidth="2" />
      <path d="M36 34a12 12 0 0 1 12-12h144a12 12 0 0 1 12 12v8H36z" className="fill-muted" />
      <circle cx="50" cy="32" r="3" className="fill-destructive/60" />
      <circle cx="60" cy="32" r="3" className="fill-amber-400" />
      <circle cx="70" cy="32" r="3" className="fill-emerald-400" />
      <rect x="52" y="56" width="56" height="40" rx="6" fill="currentColor" opacity="0.15" />
      <path d="m58 88 12-14 9 9 7-6 14 11z" fill="currentColor" opacity="0.45" />
      {[56, 66, 76, 86].map((y, i) => (
        <rect key={y} x="118" y={y} width={i % 2 ? 52 : 70} height="5" rx="2.5" className="fill-muted-foreground/25" />
      ))}
      {[108, 118, 128].map((y, i) => (
        <rect key={y} x="52" y={y} width={[136, 112, 124][i]} height="5" rx="2.5" className="fill-muted-foreground/20" />
      ))}
      <g>
        <rect x="38" y="44" width="164" height="14" fill="currentColor" opacity="0.12" />
        <rect x="38" y="57" width="164" height="2" fill="currentColor" opacity="0.6" />
        <animateTransform attributeName="transform" type="translate" values="0 0; 0 84; 0 0" dur="3.2s" repeatCount="indefinite" />
      </g>
      {([[214, 30, 7], [24, 70, 5], [212, 128, 5]] as const).map(([x, y, r]) => (
        <path
          key={`${x}-${y}`}
          d={`M${x} ${y - r}q1.5 ${r - 1.5} ${r} ${r}q-${r - 1.5} 1.5-${r} ${r}q-1.5-${r - 1.5}-${r}-${r}q${r - 1.5}-1.5 ${r}-${r}z`}
          fill="currentColor"
        >
          <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" begin={`${x % 3}s`} repeatCount="indefinite" />
        </path>
      ))}
    </svg>
  );
}

/** Stands in for a business page while the extraction is still writing the data that page shows. */
export function ExtractionInProgress({ status }: Readonly<{ status: ExtractionStatus | undefined }>) {
  const pct = Math.round(status?.progress_pct ?? 0);
  const courses = status?.counts.courses ?? 0;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-10 text-center">
      <ExtractionIllustration />
      <h1 className="mt-6 text-xl font-semibold">We&apos;re building your profile</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        We&apos;re reading your website and organising your courses, branches, fees and more. Depending on the size of
        your site this can take anywhere from a few minutes to a few hours. Feel free to leave — we&apos;ll email you
        as soon as it&apos;s done, and this page opens on its own.
      </p>

      <div className="mt-6 w-full max-w-sm space-y-2">
        <Progress value={pct} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{courses > 0 ? `${courses} course${courses === 1 ? "" : "s"} found so far` : "Starting up…"}</span>
          <span>{pct}%</span>
        </div>
      </div>

      <Button render={<Link href="/business/portal" />} variant="outline" className="mt-6 gap-1.5">
        View extraction progress <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
