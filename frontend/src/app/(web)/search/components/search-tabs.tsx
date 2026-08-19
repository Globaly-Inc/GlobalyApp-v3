import Link from "next/link";
import { GraduationCap, Building2, Users, FileCheck, Globe, Briefcase, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SearchTabKey } from "../types";

export const SEARCH_TABS: { key: SearchTabKey; label: string; icon: typeof GraduationCap }[] = [
  { key: "courses", label: "Courses", icon: GraduationCap },
  { key: "institutions", label: "Institutions", icon: Building2 },
  { key: "education-agencies", label: "Education Agents", icon: Users },
  // { key: "visa-services", label: "Visa Services", icon: FileCheck },
  // { key: "migration-agents", label: "Migration Agents", icon: Globe },
  // { key: "jobs", label: "Student Jobs", icon: Briefcase },
  { key: "scholarships", label: "Scholarships", icon: Award },
];

export function tabHref(tab: SearchTabKey, base: { country?: string; city?: string; search?: string }) {
  const query: Record<string, string> = { tab };
  if (base.country) query.country = base.country;
  if (base.city) query.city = base.city;
  if (base.search) query.search = base.search;
  return { pathname: "/search", query };
}

export function SearchTabs({
  activeTab,
  base,
}: Readonly<{ activeTab: SearchTabKey; base: { country?: string; city?: string; search?: string } }>) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-3">
      {SEARCH_TABS.map(({ key, label, icon: Icon }) => {
        const active = activeTab === key;
        return (
          <Link key={key} href={tabHref(key, base)} scroll={false}>
            <Button
              type="button"
              size="sm"
              variant={active ? "default" : "ghost"}
              className="h-9 rounded-full px-3 gap-1.5 whitespace-nowrap text-sm font-medium"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Button>
          </Link>
        );
      })}
    </div>
  );
}
