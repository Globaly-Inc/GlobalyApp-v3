"use client";

import { useState } from "react";
import {
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
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { allExtractionsApi } from "../apis";
import { latestTimestamp } from "../utils";
import { ACTIVE_STATUSES } from "../const";
import type { JobFull } from "../apis/types";
import type { JobTab } from "./job-tabs-bar";
import { QueuePanel } from "./queue-panel";
import { TabSummaryCard, type ContextKey, type TabCard } from "./tab-summary-card";

// ponytail: V3's course_data step is per-course (needs course_id), so the four
// course-data cards show Run disabled and point at the Courses tab instead.
const PER_COURSE_ONLY = "Re-run this from a course row in the Courses tab — V3 runs course data per course";

function SectionHeader({ title, description, cards }: Readonly<{ title: string; description: string; cards: TabCard[] }>) {
  const done = cards.filter((c) => c.count > 0 || c.updated).length;
  return (
    <div className="flex items-baseline justify-between gap-3 mb-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{done} of {cards.length} extracted</span>
    </div>
  );
}

export function OverviewTab({
  full,
  onJumpToTab,
  onReload,
}: Readonly<{ full: JobFull; onJumpToTab: (tab: JobTab) => void; onReload: () => void }>) {
  const { job, overview, campuses, agents, courses, coursesTotal, courseLinks, visaServices } = full;
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const jobActive = ACTIVE_STATUSES.includes(job.status);
  const isVisaServiceJob = job.source_type === "visa_service";

  const guided = (job.guided_urls ?? {}) as Record<string, unknown>;
  const hasContext = (key?: ContextKey) => {
    if (!key) return true;
    const value = guided[key];
    return Array.isArray(value) && value.length > 0;
  };

  const runStep = async (card: TabCard) => {
    if (!card.step) return;
    setBusyKey(card.key);
    try {
      await allExtractionsApi.runStep(job.id, card.step);
      toast.success(`${card.label} re-extraction started`, {
        description: "Running in the background — you can switch tabs.",
      });
      onReload();
    } catch (e) {
      toast.error("Re-run failed", { description: (e as Error).message });
    } finally {
      setBusyKey(null);
    }
  };

  const institutionCards: TabCard[] = [
    { key: "institution", label: "Institution", icon: Building2, count: overview ? 1 : 0, updated: overview?.updated_at ?? null, tab: "institution", step: "institution" },
    { key: "branches", label: "Branches", icon: MapPin, count: campuses.length, updated: latestTimestamp(campuses), tab: "branches", step: "branches", contextKey: "branches_urls", contextLabel: "branches URLs" },
    { key: "agents", label: "Agents", icon: Users, count: agents.length, updated: latestTimestamp(agents), tab: "agents", step: "agents", contextKey: "agents_urls", contextLabel: "agents URLs" },
  ];

  const visaServiceCards: TabCard[] = [
    { key: "visa_services", label: "Visa Services", icon: Globe2, count: visaServices.length, updated: latestTimestamp(visaServices), tab: "visa_services", step: "visa_services", contextKey: "services_urls", contextLabel: "services URLs" },
  ];

  const courseCards: TabCard[] = [
    { key: "courses", label: "Courses", icon: BookOpen, count: coursesTotal, updated: latestTimestamp(courses), tab: "courses", step: "discovery", contextKey: "course_list_urls", contextLabel: "course list URLs" },
    { key: "fees", label: "Fees", icon: DollarSign, count: courseLinks.course_fees.length, updated: latestTimestamp(courseLinks.course_fees), tab: "fees", runBlockedReason: PER_COURSE_ONLY, contextKey: "extract_fields", contextLabel: "extract fields" },
    { key: "intakes", label: "Intakes", icon: Calendar, count: courseLinks.intakes.length, updated: latestTimestamp(courseLinks.intakes), tab: "intakes", runBlockedReason: PER_COURSE_ONLY, contextKey: "extract_fields", contextLabel: "extract fields" },
    { key: "eligibility", label: "Eligibility", icon: GraduationCap, count: courseLinks.eligibility_requirements.length, updated: latestTimestamp(courseLinks.eligibility_requirements), tab: "eligibility", runBlockedReason: PER_COURSE_ONLY, contextKey: "extract_fields", contextLabel: "extract fields" },
    { key: "units", label: "Study Units", icon: BookOpen, count: courseLinks.study_units.length, updated: latestTimestamp(courseLinks.study_units), tab: "units", runBlockedReason: PER_COURSE_ONLY, contextKey: "extract_fields", contextLabel: "extract fields" },
    { key: "study_options", label: "Study Options", icon: Clock, count: courseLinks.study_options.length, updated: latestTimestamp(courseLinks.study_options), tab: "study_options", step: "courses" },
    { key: "accreditations", label: "Accreditations", icon: ShieldCheck, count: courseLinks.accreditations.length, updated: latestTimestamp(courseLinks.accreditations), tab: "accreditations", step: "courses" },
  ];

  const renderCard = (card: TabCard) => (
    <TabSummaryCard
      key={card.key}
      card={card}
      jobStatus={job.status}
      jobActive={jobActive}
      busy={busyKey === card.key}
      hasContext={hasContext(card.contextKey)}
      onRun={() => runStep(card)}
      onJumpToTab={onJumpToTab}
    />
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Extraction Details by Tab</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <section>
            <SectionHeader
              title={isVisaServiceJob ? "Business Data" : "Institution Data"}
              description={isVisaServiceJob ? "Overview, branches, and agents for this business." : "Overview, branches, and agents for this institution."}
              cards={institutionCards}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {institutionCards.map(renderCard)}
            </div>
          </section>

          {isVisaServiceJob ? (
            <section className="border-t border-border pt-6">
              <SectionHeader title="Visa Service Data" description="Individual visa/migration services offered by this provider." cards={visaServiceCards} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {visaServiceCards.map(renderCard)}
              </div>
            </section>
          ) : (
            <section className="border-t border-border pt-6">
              <SectionHeader title="Course Data" description="Courses and their linked fees, intakes, and requirements." cards={courseCards} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {courseCards.map(renderCard)}
              </div>
            </section>
          )}
        </CardContent>
      </Card>

      <QueuePanel jobId={job.id} />
    </div>
  );
}
