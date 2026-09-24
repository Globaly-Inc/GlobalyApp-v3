import Link from "next/link";
import { GraduationCap, Building2, Users, FileCheck, Award } from "lucide-react";
import { ScrollRow } from "@/components/scroll-row";
import { SavedTabButton } from "./saved-tab-button";
import type { SearchTabKey } from "../types";

export const SEARCH_TABS: { key: SearchTabKey; label: string; icon: typeof GraduationCap }[] = [
  { key: "courses", label: "Courses", icon: GraduationCap },
  { key: "institutions", label: "Institutions", icon: Building2 },
  { key: "education-agencies", label: "Education Counselors", icon: Users },
  { key: "visa-services", label: "Visa Services", icon: FileCheck },
  // Parked until their catalogs are populated — re-import Globe / Briefcase / Wrench when restoring these.
  // { key: "migration-agents", label: "Migration Agents", icon: Globe },
  // { key: "jobs", label: "Student Jobs", icon: Briefcase },
  { key: "scholarships", label: "Scholarships", icon: Award },
  // Services is parked too: these are business services, which have no detail page — the card can
  // only offer "View business". Restore once they are reachable on their own.
  // { key: "services", label: "Services", icon: Wrench },
];

export function tabHref(
  tab: SearchTabKey,
  base: { country?: string; city?: string; search?: string },
  basePath = "/search",
) {
  const query: Record<string, string> = { tab };
  if (base.country) query.country = base.country;
  if (base.city) query.city = base.city;
  if (base.search) query.search = base.search;
  return { pathname: basePath, query };
}

/**
 * V1's two-zone tab bar: browse tabs scroll horizontally on the left, the Saved pill sits behind
 * a divider on the right. Every link points at `basePath`, so mounting the rail at
 * /personal/explore keeps a signed-in user inside the portal shell.
 */
export function SearchTabs({
  activeTab, base, basePath = "/search", savedActive = false,
}: Readonly<{
  activeTab: SearchTabKey;
  base: { country?: string; city?: string; search?: string };
  basePath?: string;
  savedActive?: boolean;
}>) {
  return (
    <div className="flex items-center gap-2 py-3">
      <ScrollRow className="-mx-4 min-w-0 flex-1 sm:mx-0" rowClassName="flex items-center gap-2 px-4 sm:px-0">
        {SEARCH_TABS.map(({ key, label, icon: Icon }) => {
          const active = !savedActive && activeTab === key;
          return (
            <Link
              key={key}
              href={tabHref(key, base, basePath)}
              scroll={false}
              className={`flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all sm:px-5 ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          );
        })}
      </ScrollRow>

      <SavedTabButton active={savedActive} basePath={basePath} />
    </div>
  );
}
