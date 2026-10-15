"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { TabCounts } from "../apis/types";

export type JobTab =
  | "overview"
  | "site"
  | "institution"
  | "branches"
  | "agents"
  | "courses"
  | "fees"
  | "intakes"
  | "eligibility"
  | "scholarships"
  | "units"
  | "study_options"
  | "accreditations"
  | "visa_services";

type TabDef = { value: JobTab; label: string; countKey?: keyof TabCounts };

// In priority order: when the bar runs out of room, tabs drop into "More" from the end.
const TABS: TabDef[] = [
  { value: "overview", label: "Overview" },
  { value: "site", label: "Site Context" },
  { value: "institution", label: "Institution" },
  { value: "branches", label: "Branches", countKey: "branches" },
  { value: "agents", label: "Agents", countKey: "agents" },
  { value: "courses", label: "Courses", countKey: "courses" },
  { value: "fees", label: "Fees", countKey: "fees" },
  { value: "intakes", label: "Intakes", countKey: "intakes" },
  { value: "eligibility", label: "Eligibility", countKey: "eligibility" },
  { value: "scholarships", label: "Scholarships", countKey: "scholarships" },
  { value: "units", label: "Study Units", countKey: "units" },
  { value: "study_options", label: "Study Options", countKey: "study_options" },
  { value: "accreditations", label: "Accreditations", countKey: "accreditations" },
  { value: "visa_services", label: "Visa Services", countKey: "visa_services" },
];

const GAP = 4; // gap-1 between triggers
const TRIGGER = cn(
  "h-auto flex-none rounded-none border-b-2 border-transparent px-3 py-2.5 text-muted-foreground",
  "data-active:border-primary data-active:bg-transparent data-active:text-primary data-active:shadow-none",
);
const MORE = "inline-flex shrink-0 cursor-pointer items-center gap-1 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground";

/** How many tabs fit in `width`; reserves room for "More" only when some don't. */
function fitCount(widths: number[], moreWidth: number, width: number) {
  const total = widths.reduce((a, w) => a + w, 0) + GAP * (widths.length - 1);
  if (total <= width) return widths.length;
  let used = moreWidth;
  let n = 0;
  for (const w of widths) {
    if (used + GAP + w > width) break;
    used += GAP + w;
    n++;
  }
  return n;
}

export function JobTabsBar({
  active,
  onChange,
  tabs,
  institutionLabel,
  counts,
}: Readonly<{
  active: JobTab;
  onChange: (tab: JobTab) => void;
  tabs?: JobTab[];
  institutionLabel?: string;
  counts?: TabCounts;
}>) {
  const visibleTabs = (tabs ? TABS.filter((t) => tabs.includes(t.value)) : TABS).map((t) =>
    t.value === "institution" && institutionLabel ? { ...t, label: institutionLabel } : t,
  );
  const countOf = (t: TabDef) => (t.countKey && counts ? counts[t.countKey] : undefined);

  // Every tab is laid out once, invisibly, to learn its width; the bar shows as many as fit.
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(visibleTabs.length);
  const tabKey = visibleTabs.map((t) => `${t.value}:${countOf(t) ?? ""}`).join("|");
  useEffect(() => {
    const bar = barRef.current;
    const measure = measureRef.current;
    if (!bar || !measure) return;
    const update = () => {
      const items = [...measure.children] as HTMLElement[];
      const more = items.pop()!;
      setFits(fitCount(items.map((el) => el.offsetWidth), more.offsetWidth, bar.clientWidth));
    };
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    observer.observe(measure); // labels re-measure once web fonts load
    return () => observer.disconnect();
  }, [tabKey]);

  let inBar = visibleTabs.slice(0, fits);
  // The open tab always stays in view: it takes the last visible slot if it would overflow.
  if (fits > 0 && !inBar.some((t) => t.value === active)) {
    const current = visibleTabs.find((t) => t.value === active);
    if (current) inBar = [...inBar.slice(0, fits - 1), current];
  }
  const inMore = visibleTabs.filter((t) => !inBar.includes(t));

  const label = (tab: TabDef) => {
    const count = countOf(tab);
    return <>{tab.label}{count !== undefined && <TabsCount>{count}</TabsCount>}</>;
  };

  return (
    <Tabs value={active} onValueChange={(next) => onChange(next as JobTab)}>
      <div ref={barRef} className="relative flex items-center overflow-hidden border-b">
        <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex gap-1 whitespace-nowrap">
          {visibleTabs.map((tab) => (
            <span key={tab.value} className={cn(TRIGGER, "inline-flex items-center gap-1.5 text-sm font-medium")}>{label(tab)}</span>
          ))}
          <span className={MORE}>More <ChevronDown className="h-4 w-4" /></span>
        </div>
        <TabsList className="h-auto w-auto gap-1 overflow-visible rounded-none bg-transparent p-0 shadow-none">
          {inBar.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className={TRIGGER}>{label(tab)}</TabsTrigger>
          ))}
        </TabsList>
        {inMore.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<button type="button" className={MORE}>More <ChevronDown className="h-4 w-4" /></button>} />
            <DropdownMenuContent align="end" className="w-52">
              {inMore.map((tab) => {
                const count = countOf(tab);
                return (
                  <DropdownMenuItem key={tab.value} className="cursor-pointer justify-between" onClick={() => onChange(tab.value)}>
                    {tab.label}
                    {count !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </Tabs>
  );
}
