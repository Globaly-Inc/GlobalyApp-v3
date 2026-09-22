"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppDispatch } from "@/lib/hooks";
import { startExtraction } from "../../store/business-onboarding-slice";
import type { BusinessProfile } from "../../apis/types";
import { ExtractionProgressCard } from "./extraction-progress-card";
import { SiteUrlsCard } from "./site-urls-card";

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function StartExtractionCard({ profile }: Readonly<{ profile: BusinessProfile }>) {
  const dispatch = useAppDispatch();
  const [website, setWebsite] = useState(profile.website ?? "");
  const [starting, setStarting] = useState(false);

  const isInstitution = (profile.business_category_name ?? "").toLowerCase().includes("institution");
  if (!isInstitution) return null;
  if (profile.source_job_id) {
    return (
      <div className="space-y-4">
        <ExtractionProgressCard />
        <SiteUrlsCard />
      </div>
    );
  }

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          Populate your profile automatically
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          We&apos;ll pull your courses, branches, and details from this website.
        </p>
        <Input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://example.edu"
        />
        <Button onClick={handleStart} disabled={starting || !isValidUrl(website.trim())}>
          {starting ? "Starting…" : "Start extraction"}
        </Button>
      </CardContent>
    </Card>
  );
}
