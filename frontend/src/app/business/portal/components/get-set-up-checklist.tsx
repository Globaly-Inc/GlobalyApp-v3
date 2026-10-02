"use client";

import Link from "next/link";
import { useAppSelector } from "@/lib/hooks";
import { ArrowUpRight, CheckCircle2, Circle, Eye, Lock, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { OnboardingProgress } from "../../apis/types";

/** Where each step's "Start now" sends the owner. extract_website has no route of its own — its
 * card is already the main thing on this page, so it just scrolls to it. */
const STEP_LINKS: Record<string, string> = {
  extract_website: "#extraction-card",
  review_courses: "/business/profile?tab=services",
  customize_assistant: "/business/settings/ai-embed",
  add_chat_widget: "/business/settings/ai-embed",
  invite_team: "/business/profile?tab=team",
};

/**
 * Steps can be done in any order — they tick themselves from real data, not clicks — except where
 * one genuinely can't work without another (courses can be reviewed or added by hand any time, so
 * only the chat widget waits). A prerequisite missing from the list doesn't lock anything.
 */
// The suggested next step gets the one filled button; every other step gets a one-line StepNote.
const STEP_BUTTON_PRIMARY = "mt-1.5 inline-flex h-7 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90";

/** "🔒 Unlocks after Customise…" / "↗ Available now Open" — icon, optional muted text, link. */
function StepNote({ icon: Icon, text, link, fallback }: Readonly<{
  icon: LucideIcon; text?: string; link?: { href: string; label: string }; fallback?: string;
}>) {
  return (
    <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-3 w-3 shrink-0" />
      <span>
        {text && `${text} `}
        {link ? <Link href={link.href} className="font-medium text-primary hover:underline">{link.label}</Link> : fallback}
      </span>
    </p>
  );
}

const REQUIRES: Record<string, string> = {
  add_chat_widget: "customize_assistant", // the embed code comes from the assistant's settings
};

/** The profile tabs live under the org's id (/business/profile/73?tab=team) — bare
 * /business/profile would land on the wrong page. */
const linkFor = (key: string, businessId: number | null) => {
  const href = STEP_LINKS[key];
  if (!href || businessId == null) return href;
  return href.startsWith("/business/profile?") ? href.replace("/business/profile", `/business/profile/${businessId}`) : href;
};

export function GetSetUpChecklist({ progress }: Readonly<{ progress: OnboardingProgress }>) {
  const businessId = useAppSelector((st) => st.businessOnboarding.profile?.id ?? null);
  const byKey = new Map(progress.steps.map((s) => [s.key, s]));
  const blockerOf = (key: string) => {
    const req = byKey.get(REQUIRES[key] ?? "");
    return req && !req.done ? req : null;
  };
  // The suggested next step: the first unfinished one that isn't waiting on another.
  const firstIncompleteIndex = progress.steps.findIndex((s) => !s.done && !blockerOf(s.key));
  const percent = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

  return (
    <Card id="get-set-up">
      <CardHeader className="space-y-2 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Get set up</CardTitle>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {progress.completed}/{progress.total}
          </span>
        </div>
        <Progress value={percent} className="h-1.5" />
      </CardHeader>
      <CardContent className="space-y-0.5 pb-4">
        {progress.steps.map((step, i) => {
          const isCurrent = i === firstIncompleteIndex;
          const href = linkFor(step.key, businessId);
          const blocker = step.done ? null : blockerOf(step.key);
          const blockerHref = blocker ? linkFor(blocker.key, businessId) : undefined;
          return (
            <div key={step.key} className="flex items-start gap-3 py-2">
              <span className="mt-0.5 shrink-0">
                {step.done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : isCurrent ? (
                  // SVG, not nested boxes: both circles share one centre, so the dot can't drift a
                  // pixel off when the browser rounds the 2px border.
                  <svg viewBox="0 0 20 20" className="h-5 w-5 text-primary" aria-hidden>
                    <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
                    <circle cx="10" cy="10" r="4" fill="currentColor" />
                  </svg>
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/30" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("text-sm font-medium", step.done ? "text-muted-foreground line-through" : "text-foreground")}>
                    {step.label}
                  </p>
                  {step.duration && !step.done && (
                    <span className="shrink-0 text-xs text-muted-foreground">{step.duration}</span>
                  )}
                  {/* Done steps stay reachable — on the title row, where the duration was. */}
                  {step.done && href && (
                    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
                      <Eye className="h-3 w-3" /> View
                    </Link>
                  )}
                </div>
                {step.detail && !step.done && <p className="text-xs text-muted-foreground">{step.detail}</p>}
                {!step.done && href && (isCurrent ? (
                  <Link href={href} className={STEP_BUTTON_PRIMARY}>Start now</Link>
                ) : blocker ? (
                  // Locked, but never a dead end: the unlocking step's name links straight to it.
                  <StepNote icon={Lock} text="Unlocks after" link={blockerHref ? { href: blockerHref, label: blocker.label } : undefined} fallback={blocker.label} />
                ) : (
                  <StepNote icon={ArrowUpRight} text="Available now" link={{ href, label: "Open" }} />
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
