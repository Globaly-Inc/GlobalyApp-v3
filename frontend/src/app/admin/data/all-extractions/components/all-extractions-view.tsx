"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileCheck, ListOrdered, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardMode } from "../const";
import { JobsList } from "./jobs-list";

type ListTab = "all" | "ai" | "extracted";

// The three screens V2 shipped as separate nav items — same list, different
// status filter — so they live here as sub-tabs instead of top-level pages.
const TABS: { value: ListTab; label: string; icon: LucideIcon; mode: DashboardMode }[] = [
  { value: "all", label: "All", icon: ListOrdered, mode: "all" },
  { value: "ai", label: "AI Extraction", icon: Sparkles, mode: "ai-ongoing" },
  { value: "extracted", label: "Extracted Data", icon: FileCheck, mode: "completed" },
];

function parseTab(raw: string | null): ListTab {
  return TABS.some((t) => t.value === raw) ? (raw as ListTab) : "all";
}

export function AllExtractionsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = parseTab(searchParams.get("tab"));
  const mode = TABS.find((t) => t.value === active)!.mode;

  const setTab = (tab: ListTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">All Extractions</h1>
        <p className="text-muted-foreground mt-1">
          Every extraction job — ongoing, completed, failed, declined. Nothing is hidden.
        </p>
      </div>

      <div className="mb-4 w-full overflow-x-auto border-b border-border">
        <div className="inline-flex w-max gap-1 pb-px">
          {TABS.map((tab) => {
            const isActive = active === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setTab(tab.value)}
                className={cn(
                  "-mb-px flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary bg-primary/5 text-primary font-semibold"
                    : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <tab.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <JobsList mode={mode} />
    </div>
  );
}
