"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListOrdered, ShieldCheck, Stamp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollRow } from "@/components/scroll-row";
import { JobsList } from "./jobs-list";
import { MaraAgentsView } from "../../mara-agents/components/mara-agents-view";
import { VisasView } from "../../visas/components/visas-view";

type ListTab = "all" | "mara" | "visas";

// MARA Agents and Visas moved here from their own top-level nav items — same page,
// own Redux slice/API each, rendered inline so the tab bar stays put across sub-tabs.
const TABS: { value: ListTab; label: string; icon: LucideIcon }[] = [
  { value: "all", label: "All", icon: ListOrdered },
  { value: "mara", label: "MARA Agents", icon: ShieldCheck },
  { value: "visas", label: "Visas", icon: Stamp },
];

function parseTab(raw: string | null): ListTab {
  return TABS.some((t) => t.value === raw) ? (raw as ListTab) : "all";
}

export function AllExtractionsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = parseTab(searchParams.get("tab"));

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

      <ScrollRow className="mb-4 w-full border-b border-border">
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
      </ScrollRow>

      {active === "all" && <JobsList mode="all" />}
      {active === "mara" && <MaraAgentsView />}
      {active === "visas" && <VisasView />}
    </div>
  );
}
