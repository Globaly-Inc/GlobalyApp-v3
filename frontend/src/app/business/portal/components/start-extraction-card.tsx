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
import { EXTRACTION_CATEGORIES } from "../const";
import type { BusinessProfile } from "../../apis/types";
import { ConfirmCrawlDialog, crawlOrigin } from "./confirm-crawl-dialog";
import { ExtractionProgressCard } from "./extraction-progress-card";

const STEPS = [
  { title: "Crawl", detail: "Every public page on your domain" },
  { title: "Organise", detail: "Into courses, fees and intakes" },
  { title: "Flag gaps", detail: "So you know what to fix" },
];


export function StartExtractionCard({
  profile,
}: Readonly<{ profile: BusinessProfile }>) {
  const dispatch = useAppDispatch();
  const [website, setWebsite] = useState(profile.website ?? "");
  const [starting, setStarting] = useState(false);
  // Board 8: the domain is shown back resolved, with what we'll collect, before anything runs.
  const [confirming, setConfirming] = useState(false);

  const isInstitution = (profile.business_category_name ?? "").toLowerCase().includes("institution");
  if (!isInstitution) return null;
  // A branch sharing its head office's website shows that extraction — the status endpoint
  // answers with the head office's job — instead of offering to crawl the same site again.
  if (profile.source_job_id || profile.extraction_parent_name) {
    return (
      <div id="extraction-card">
        <ExtractionProgressCard sharedFrom={profile.extraction_parent_name ?? null} website={profile.website ?? null} />
      </div>
    );
  }

  const normalised = crawlOrigin(website);
  const valid = normalised !== null;

  const handleStart = async (origin: string) => {
    setStarting(true);
    try {
      await dispatch(startExtraction({ website: origin })).unwrap();
      setConfirming(false);
      toast.success("Extraction started", { description: "We'll populate your profile from your website shortly." });
    } catch (e) {
      toast.error("Couldn't start extraction", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setStarting(false);
    }
  };

  return (
    // The one thing to do on the page, so it carries a tinted edge rather than the default grey.
    <Card id="extraction-card" className="overflow-hidden pt-0">
      <div aria-hidden className="h-[3px] bg-[#23DDF6]" />
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/objects/sparkle.webp" alt="" aria-hidden className="size-12 shrink-0 object-contain" />
          <div className="space-y-1">
            <p className="text-[11px] font-semibold tracking-wider text-primary uppercase">Your next step</p>
            <h2 className="text-xl leading-tight">Build your profile from your website</h2>
            <p className="text-sm text-muted-foreground">
              We read every public page and turn it into courses, fees, intakes and branches — then flag
              what&apos;s missing. You review everything before it goes live.
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
                placeholder="example.edu"
                className={valid ? "h-11 pl-9 pr-32" : "h-11 pl-9"}
              />
              {valid && (
                <span className="pointer-events-none absolute inset-y-0 right-2 my-auto flex h-6 items-center gap-1 rounded-full bg-success/12 px-2.5 text-xs font-semibold text-success">
                  <Check className="h-3 w-3" /> Looks right
                </span>
              )}
            </div>
            <Button size="lg" onClick={() => setConfirming(true)} disabled={starting || !valid} className="shrink-0 px-6">
              Review and start
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>

        <p className="-mt-3 text-xs text-muted-foreground">
          Just the domain is fine — we&apos;ll add https:// for you. We only read pages that are already public.
        </p>

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
          <span className="mr-1 text-xs text-muted-foreground">We look for:</span>
          {EXTRACTION_CATEGORIES.map((c) => (
            <Badge key={c} variant="secondary" className="font-normal">{c}</Badge>
          ))}
        </div>
      </CardContent>

      <ConfirmCrawlDialog
        open={confirming}
        onOpenChange={(next) => !starting && setConfirming(next)}
        typed={website}
        starting={starting}
        onConfirm={handleStart}
      />
    </Card>
  );
}
