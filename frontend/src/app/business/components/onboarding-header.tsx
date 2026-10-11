"use client";

import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOGO } from "@/lib/public-assets";

const TOTAL_STEPS = 2;

export function OnboardingHeader({ step }: Readonly<{ step: number }>) {
  return (
    <header className="h-16 border-b border-border bg-background flex items-center justify-between px-6">
      <Link href="/" className="flex items-center">
        <Image src={LOGO.src} alt="GlobalyAI" width={LOGO.width} height={LOGO.height} className="h-7 w-auto" />
      </Link>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s, i, arr) => (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {step > s ? <Check className="h-3.5 w-3.5" /> : s}
            </div>
            {i < arr.length - 1 && <div className={cn("w-8 h-0.5 transition-colors", step > s ? "bg-primary" : "bg-muted")} />}
          </div>
        ))}
      </div>
    </header>
  );
}
