"use client";

import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { useAppSelector } from "@/lib/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ProfileCompletionCard() {
  const completion = useAppSelector((state) => state.profile.profile?.completion);
  if (!completion || completion.percentage >= 100) return null;

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Complete your profile</p>
          <span className="text-sm font-semibold text-destructive">{completion.percentage}%</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {completion.items.map((item) => (
            <span
              key={item.label}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                item.met ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border text-muted-foreground"
              }`}
            >
              {item.met && <CheckCircle2 className="h-3 w-3" />}
              {item.label}
            </span>
          ))}
        </div>
        <Button
          className="flex w-full items-center justify-center gap-2 rounded-md border border-primary bg-primary px-2 py-2 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 backdrop-blur-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95"
          render={<Link href="/personal/profile" />}
        >
          Complete profile
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
