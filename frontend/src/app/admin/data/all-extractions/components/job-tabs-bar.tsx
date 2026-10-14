"use client";

import type { LucideIcon } from "lucide-react";
import {
  ListOrdered,
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
  Link2,
  Award,
} from "lucide-react";
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const TABS: { value: JobTab; label: string; icon: LucideIcon; countKey?: keyof TabCounts }[] = [
  { value: "overview", label: "Overview", icon: ListOrdered },
  { value: "site", label: "Site Context", icon: Link2 },
  { value: "institution", label: "Institution", icon: Building2 },
  { value: "branches", label: "Branches", icon: MapPin, countKey: "branches" },
  { value: "agents", label: "Agents", icon: Users, countKey: "agents" },
  { value: "courses", label: "Courses", icon: BookOpen, countKey: "courses" },
  { value: "fees", label: "Fees", icon: DollarSign, countKey: "fees" },
  { value: "intakes", label: "Intakes", icon: Calendar, countKey: "intakes" },
  { value: "eligibility", label: "Eligibility", icon: GraduationCap, countKey: "eligibility" },
  { value: "scholarships", label: "Scholarships", icon: Award, countKey: "scholarships" },
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
  // ui/tabs' list scrolls horizontally on its own, so all 13 tabs stay reachable on a phone.
  return (
    <Tabs value={active} onValueChange={(next) => onChange(next as JobTab)}>
      <TabsList>
        {visibleTabs.map((tab) => {
          const count = tab.countKey && counts ? counts[tab.countKey] : undefined;
          return (
            <TabsTrigger key={tab.value} value={tab.value}>
              <tab.icon />
              {tab.label}
              {count !== undefined && <TabsCount>{count}</TabsCount>}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
