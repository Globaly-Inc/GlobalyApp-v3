"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "./static/onboarding-content";
import type { StudentProfile } from "./apis/types";

export function OnboardingCategoryStep({
  category,
  setCategory,
}: Readonly<{
  category: StudentProfile["user_sub_category"];
  setCategory: (value: StudentProfile["user_sub_category"]) => void;
}>) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">What brings you to GlobalyAI?</h1>
        <p className="text-muted-foreground mt-1">This helps us personalise your experience.</p>
      </div>
      <div className="space-y-3">
        {CATEGORIES.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setCategory(opt.value)}
            className={cn(
              "w-full flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-all cursor-pointer",
              category === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30",
            )}
          >
            <div
              className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                category === opt.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              <opt.icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground">{opt.title}</p>
              <p className="text-sm text-muted-foreground">{opt.description}</p>
            </div>
            <div
              className={cn(
                "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0",
                category === opt.value ? "border-primary bg-primary" : "border-muted-foreground/40",
              )}
            >
              {category === opt.value && <Check className="h-3 w-3 text-primary-foreground" />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
