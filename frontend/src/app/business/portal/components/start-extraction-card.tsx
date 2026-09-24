"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
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
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4.5 w-4.5" />
          </span>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">Get started with web data extraction &amp; analysis</h2>
            <p className="text-sm text-muted-foreground">
              We&apos;ll read your official website and build your profile — courses, branches, fees and more —
              then analyse it for gaps.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="extraction-website" className="text-xs font-medium text-muted-foreground">
            Your institution&apos;s website
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Input
                id="extraction-website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.edu"
                className={valid ? "pr-28" : undefined}
              />
              {valid && (
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Valid URL
                </span>
              )}
            </div>
            <Button onClick={handleStart} disabled={starting || !valid} className="shrink-0">
              {starting ? "Starting…" : "Start extraction"}
              {!starting && <ArrowRight className="ml-1.5 h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="flex gap-2.5 rounded-lg border border-border bg-muted/30 p-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">We&apos;ll look for:</span>
          {CATEGORIES.map((c) => (
            <Badge key={c} variant="outline" className="font-normal">{c}</Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
