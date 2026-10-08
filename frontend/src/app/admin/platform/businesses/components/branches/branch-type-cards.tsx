"use client";

import { Building2, Network, Store, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRANCH_TYPE_OPTIONS } from "../../const";
import type { BranchType } from "../../apis/types";

const ICONS: Record<BranchType, LucideIcon> = { same_company: Building2, subsidiary: Network, franchise: Store };

export function BranchTypeCards({ value, onChange }: Readonly<{ value: BranchType; onChange: (value: BranchType) => void }>) {
  return (
    <div role="radiogroup" aria-label="Branch type" className="grid gap-2.5 sm:grid-cols-3">
      {BRANCH_TYPE_OPTIONS.map((opt) => {
        const Icon = ICONS[opt.value];
        const checked = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(opt.value)}
            className={cn(
              "group relative flex flex-col items-start gap-2 rounded-xl border-[1.5px] p-3.5 text-left transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-md",
              checked ? "border-primary bg-gradient-to-br from-primary/10 to-card to-75%" : "border-border hover:border-primary/40",
            )}
          >
            <span
              className={cn(
                "absolute right-3 top-3 flex size-[18px] items-center justify-center rounded-full border-2 transition-colors",
                checked ? "border-primary" : "border-muted-foreground/30",
              )}
            >
              {checked && <span className="animate-pop-in size-2 rounded-full bg-primary" />}
            </span>
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-lg transition-[transform,background-color,color] duration-300 ease-[cubic-bezier(.34,1.56,.64,1)]",
                checked ? "-rotate-6 scale-105 bg-primary text-primary-foreground" : "bg-muted text-primary",
              )}
            >
              <Icon className="size-[18px]" />
            </span>
            <span className="text-sm font-semibold text-foreground">{opt.label}</span>
            <span className="text-xs leading-snug text-muted-foreground">{opt.desc}</span>
          </button>
        );
      })}
    </div>
  );
}
