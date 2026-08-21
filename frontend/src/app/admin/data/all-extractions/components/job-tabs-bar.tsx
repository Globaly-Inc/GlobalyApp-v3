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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  | "accreditations";

const TABS: { value: JobTab; label: string; icon: LucideIcon }[] = [
  { value: "overview", label: "Overview", icon: ListOrdered },
  { value: "context", label: "Context", icon: Settings2 },
  { value: "institution", label: "Institution", icon: Building2 },
  { value: "branches", label: "Branches", icon: MapPin },
  { value: "agents", label: "Agents", icon: Users },
  { value: "courses", label: "Courses", icon: BookOpen },
  { value: "fees", label: "Fees", icon: DollarSign },
  { value: "intakes", label: "Intakes", icon: Calendar },
  { value: "eligibility", label: "Eligibility", icon: GraduationCap },
  { value: "units", label: "Study Units", icon: BookOpen },
  { value: "study_options", label: "Study Options", icon: Clock },
  { value: "accreditations", label: "Accreditations", icon: ShieldCheck },
];

export function JobTabsBar({ active, onChange }: Readonly<{ active: JobTab; onChange: (tab: JobTab) => void }>) {
  return (
    <div className="w-full overflow-x-auto border-b border-border">
      <div className="inline-flex w-max gap-1 pb-px">
        {TABS.map((tab) => {
          const isActive = active === tab.value;
          return (
            <button
              key={tab.value}
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
            </button>
          );
        })}
      </div>
    </div>
  );
}
