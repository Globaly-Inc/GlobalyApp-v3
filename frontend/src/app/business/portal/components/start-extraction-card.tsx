"use client";

import { useState } from "react";
import { ArrowRight, Check, Globe } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppDispatch } from "@/lib/hooks";
import { startExtraction } from "../../store/business-onboarding-slice";
import type { BusinessProfile } from "../../apis/types";
import { ExtractionProgressCard } from "./extraction-progress-card";

const STEPS = [
  { title: "Crawl your site", detail: "Finds every public page on your site." },
  { title: "Extract & organise", detail: "Sorts pages into courses, fees, intakes…" },
  { title: "Analyse & review", detail: "Flags missing info before you publish." },
];

const CATEGORIES = [
  "Courses", "Branches", "Fees", "Intakes", "Eligibility", "Study units", "Study options", "Accreditations", "Agents",
];

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function StartExtractionCard({
  profile,
}: Readonly<{ profile: BusinessProfile }>) {
  const dispatch = useAppDispatch();
  const [website, setWebsite] = useState(profile.website ?? "");
  const [starting, setStarting] = useState(false);

  const isInstitution = (profile.business_category_name ?? "").toLowerCase().includes("institution");
  if (!isInstitution) return null;
  if (profile.source_job_id) {
    return (
      <div id="extraction-card">
        <ExtractionProgressCard />
      </div>
    );
  }

  const valid = isValidUrl(website.trim());

  const handleStart = async () => {
    setStarting(true);
    try {
      await dispatch(startExtraction({ website: website.trim() })).unwrap();
      toast.success("Extraction started", { description: "We'll populate your profile from your website shortly." });
    } catch (e) {
      toast.error("Couldn't start extraction", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setStarting(false);
    }
  };

  return (
    <Card id="extraction-card">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/objects/sparkle.webp" alt="" aria-hidden className="size-12 shrink-0 object-contain" />
          <div className="space-y-1">
            <h2 className="text-lg">Get started with web data extraction &amp; analysis</h2>
            <p className="text-sm text-muted-foreground">
              We&apos;ll read your official website and build your profile — courses, branches, fees and more —
              then analyse it for gaps.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-1.5">
          <label htmlFor="extraction-website" className="text-xs font-medium text-muted-foreground">
            Your institution&apos;s website
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="extraction-website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.edu"
                className={valid ? "h-11 pl-9 pr-28" : "h-11 pl-9"}
              />
              {valid && (
                <span className="pointer-events-none absolute inset-y-0 right-2 my-auto flex h-6 items-center gap-1 rounded-full bg-success/12 px-2.5 text-xs font-semibold text-success">
                  <Check className="h-3 w-3" /> Valid URL
                </span>
              )}
            </div>
            <Button size="lg" onClick={handleStart} disabled={starting || !valid} className="shrink-0 px-6">
              {starting ? "Starting…" : "Start extraction"}
              {!starting && <ArrowRight className="ml-1.5 h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* A numbered stepper; the connector runs from each number to the next on sm+. */}
        <ol className="grid gap-4 sm:grid-cols-3 sm:gap-0">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative sm:pr-4">
              {i < STEPS.length - 1 && (
                <span aria-hidden className="absolute left-9 right-1 top-[0.8rem] hidden h-px bg-border sm:block" />
              )}
              <span className="relative z-10 flex size-[1.625rem] items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground ring-4 ring-card">
                {i + 1}
              </span>
              <p className="mt-2.5 text-sm font-semibold">{step.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{step.detail}</p>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-5">
          <span className="mr-1 text-xs text-muted-foreground">We&apos;ll look for:</span>
          {CATEGORIES.map((c) => (
            <Badge key={c} variant="secondary" className="font-normal">{c}</Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
