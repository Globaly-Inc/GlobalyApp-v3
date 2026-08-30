"use client";

import type { LucideIcon } from "lucide-react";
import {
  ListOrdered,
  Settings2,
  Building2,
  MapPin,
  Users,
  BookOpen,
  DollarSign,
  Calendar,
  GraduationCap,
  Clock,
  ShieldCheck,
  Globe2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TabCounts } from "../apis/types";

export type JobTab =
  | "overview"
  | "context"
  | "institution"
  | "branches"
  | "agents"
  | "courses"
  | "fees"
  | "intakes"
  | "eligibility"
  | "units"
  | "study_options"
  | "accreditations"
  | "visa_services";

const TABS: { value: JobTab; label: string; icon: LucideIcon; countKey?: keyof TabCounts }[] = [
  { value: "overview", label: "Overview", icon: ListOrdered },
  { value: "context", label: "Context", icon: Settings2 },
  { value: "institution", label: "Institution", icon: Building2 },
  { value: "branches", label: "Branches", icon: MapPin, countKey: "branches" },
  { value: "agents", label: "Agents", icon: Users, countKey: "agents" },
  { value: "courses", label: "Courses", icon: BookOpen, countKey: "courses" },
  { value: "fees", label: "Fees", icon: DollarSign, countKey: "fees" },
  { value: "intakes", label: "Intakes", icon: Calendar, countKey: "intakes" },
  { value: "eligibility", label: "Eligibility", icon: GraduationCap, countKey: "eligibility" },
  { value: "units", label: "Study Units", icon: BookOpen, countKey: "units" },
  { value: "study_options", label: "Study Options", icon: Clock, countKey: "study_options" },
  { value: "accreditations", label: "Accreditations", icon: ShieldCheck, countKey: "accreditations" },
  { value: "visa_services", label: "Visa Services", icon: Globe2, countKey: "visa_services" },
];

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
  return (
    <div className="w-full overflow-x-auto border-b border-border">
      <div className="inline-flex w-max gap-1 pb-px">
        {visibleTabs.map((tab) => {
          const isActive = active === tab.value;
          const count = tab.countKey && counts ? counts[tab.countKey] : undefined;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 -mb-px px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                isActive
                  ? "border-primary bg-primary/5 text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <tab.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
              {tab.label}
              {count !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-normal font-semibold leading-none",
                    isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
