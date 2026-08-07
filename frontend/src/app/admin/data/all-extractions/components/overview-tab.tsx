import type { LucideIcon } from "lucide-react";
import { Building2, MapPin, Users, BookOpen, DollarSign, Calendar, GraduationCap, Clock, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtTime, latestTimestamp } from "../utils";
import type { JobFull } from "../apis/types";
import type { JobTab } from "./job-tabs-bar";

type TabCard = { key: string; label: string; icon: LucideIcon; count: number; updated: string | null; tab: JobTab };

function renderCard(c: TabCard, onJumpToTab: (tab: JobTab) => void) {
  const isEmpty = c.count === 0 && !c.updated;
  return (
    <Card key={c.key} className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <button
            onClick={() => onJumpToTab(c.tab)}
            className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors cursor-pointer"
          >
            <c.icon className="h-4 w-4" />
            {c.label}
          </button>
          <span className={`text-xl font-bold ${isEmpty ? "text-muted-foreground/60" : ""}`}>{c.count}</span>
        </div>
        <p className="text-xs text-muted-foreground">{isEmpty ? "Not extracted yet" : `Last updated: ${fmtTime(c.updated)}`}</p>
      </CardContent>
    </Card>
  );
}

export function OverviewTab({ full, onJumpToTab }: Readonly<{ full: JobFull; onJumpToTab: (tab: JobTab) => void }>) {
  const { overview, campuses, agents, courses, courseLinks } = full;

  const institutionCards: TabCard[] = [
    { key: "institution", label: "Institution", icon: Building2, count: overview ? 1 : 0, updated: overview?.updated_at ?? null, tab: "institution" },
    { key: "branches", label: "Branches", icon: MapPin, count: campuses.length, updated: latestTimestamp(campuses), tab: "branches" },
    { key: "agents", label: "Agents", icon: Users, count: agents.length, updated: latestTimestamp(agents), tab: "agents" },
  ];

  const courseCards: TabCard[] = [
    { key: "courses", label: "Courses", icon: BookOpen, count: courses.length, updated: latestTimestamp(courses), tab: "courses" },
    { key: "fees", label: "Fees", icon: DollarSign, count: courseLinks.course_fees.length, updated: latestTimestamp(courseLinks.course_fees), tab: "fees" },
    { key: "intakes", label: "Intakes", icon: Calendar, count: courseLinks.intakes.length, updated: latestTimestamp(courseLinks.intakes), tab: "intakes" },
    { key: "eligibility", label: "Eligibility", icon: GraduationCap, count: courseLinks.eligibility_requirements.length, updated: latestTimestamp(courseLinks.eligibility_requirements), tab: "eligibility" },
    { key: "units", label: "Study Units", icon: BookOpen, count: courseLinks.study_units.length, updated: latestTimestamp(courseLinks.study_units), tab: "units" },
    { key: "study_options", label: "Study Options", icon: Clock, count: courseLinks.study_options.length, updated: latestTimestamp(courseLinks.study_options), tab: "study_options" },
    { key: "accreditations", label: "Accreditations", icon: ShieldCheck, count: courseLinks.accreditations.length, updated: latestTimestamp(courseLinks.accreditations), tab: "accreditations" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Extraction Details by Tab</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Institution data</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {institutionCards.map((c) => renderCard(c, onJumpToTab))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Course data</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {courseCards.map((c) => renderCard(c, onJumpToTab))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
