"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  MapPin,
  Users,
  BookOpen,
  DollarSign,
  Calendar,
  GraduationCap,
  Clock,
  Loader2,
  RefreshCcw,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { allExtractionsApi } from "../apis";
import { fmtTime, latestTimestamp } from "../utils";
import type { JobFull } from "../apis/types";
import type { JobTab } from "./job-tabs-bar";
import { QueuePanel } from "./queue-panel";

type ContextKey = "branches_urls" | "agents_urls" | "course_list_urls" | "extract_fields";

type TabCard = {
  key: string;
  label: string;
  icon: LucideIcon;
  count: number;
  updated: string | null;
  tab: JobTab;
  /** Pipeline step to dispatch for a re-run. Absent = no Run button. */
  step?: string;
  /** Guided-URL key that must be filled in before the step can run. */
  contextKey?: ContextKey;
  contextLabel?: string;
  /** Set when the card shows a Run button the backend can't serve job-wide yet. */
  runBlockedReason?: string;
};

// ponytail: V3's course_data step is per-course (needs course_id), so the four
// course-data cards show Run disabled and point at the Courses tab instead.
const PER_COURSE_ONLY = "Re-run this from a course row in the Courses tab — V3 runs course data per course";

function TabSummaryCard({
  card,
  busy,
  hasContext,
  onRun,
  onJumpToTab,
}: Readonly<{
  card: TabCard;
  busy: boolean;
  hasContext: boolean;
  onRun: () => void;
  onJumpToTab: (tab: JobTab) => void;
}>) {
  const isEmpty = card.count === 0 && !card.updated;
  const runnable = Boolean(card.step) || Boolean(card.runBlockedReason);

  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <button
            onClick={() => onJumpToTab(card.tab)}
            className="flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary cursor-pointer"
          >
            <card.icon className="h-4 w-4" />
            {card.label}
          </button>
          <span className={`text-xl font-bold ${isEmpty ? "text-muted-foreground/60" : ""}`}>{card.count}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {isEmpty ? "Not extracted yet" : `Last updated: ${fmtTime(card.updated)}`}
        </p>

        {runnable && hasContext && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full gap-1.5 text-xs cursor-pointer"
            disabled={busy || Boolean(card.runBlockedReason)}
            title={card.runBlockedReason}
            onClick={onRun}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
            {card.updated ? "Re-run" : "Run"}
          </Button>
        )}

        {runnable && !hasContext && (
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-1 gap-1.5 text-xs"
              disabled
              title={`Add ${card.contextLabel} in the Context tab first`}
            >
              <RefreshCcw className="h-3 w-3" />
              Run
            </Button>
            <Button
              size="sm"
              className="h-7 flex-1 gap-1.5 text-xs cursor-pointer"
              onClick={() => onJumpToTab("context")}
            >
              <Settings2 className="h-3 w-3" />
              Add Context
            </Button>
          </div>
        )}

        {!runnable && card.contextKey && !hasContext && (
          <Button
            size="sm"
            className="h-7 w-full gap-1.5 text-xs cursor-pointer"
            onClick={() => onJumpToTab("context")}
          >
            <Settings2 className="h-3 w-3" />
            Add Context
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function OverviewTab({
  full,
  onJumpToTab,
  onReload,
}: Readonly<{ full: JobFull; onJumpToTab: (tab: JobTab) => void; onReload: () => void }>) {
  const { job, overview, campuses, agents, courses, courseLinks } = full;
  const [busyKey, setBusyKey] = useState<string | null>(null);

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

  const courseCards: TabCard[] = [
    { key: "courses", label: "Courses", icon: BookOpen, count: courses.length, updated: latestTimestamp(courses), tab: "courses", contextKey: "course_list_urls", contextLabel: "course list URLs" },
    { key: "fees", label: "Fees", icon: DollarSign, count: courseLinks.course_fees.length, updated: latestTimestamp(courseLinks.course_fees), tab: "fees", runBlockedReason: PER_COURSE_ONLY, contextKey: "extract_fields", contextLabel: "extract fields" },
    { key: "intakes", label: "Intakes", icon: Calendar, count: courseLinks.intakes.length, updated: latestTimestamp(courseLinks.intakes), tab: "intakes", runBlockedReason: PER_COURSE_ONLY, contextKey: "extract_fields", contextLabel: "extract fields" },
    { key: "eligibility", label: "Eligibility", icon: GraduationCap, count: courseLinks.eligibility_requirements.length, updated: latestTimestamp(courseLinks.eligibility_requirements), tab: "eligibility", runBlockedReason: PER_COURSE_ONLY, contextKey: "extract_fields", contextLabel: "extract fields" },
    { key: "units", label: "Study Units", icon: BookOpen, count: courseLinks.study_units.length, updated: latestTimestamp(courseLinks.study_units), tab: "units", runBlockedReason: PER_COURSE_ONLY, contextKey: "extract_fields", contextLabel: "extract fields" },
    { key: "study_options", label: "Study Options", icon: Clock, count: courseLinks.study_options.length, updated: latestTimestamp(courseLinks.study_options), tab: "study_options" },
    { key: "accreditations", label: "Accreditations", icon: ShieldCheck, count: courseLinks.accreditations.length, updated: latestTimestamp(courseLinks.accreditations), tab: "accreditations" },
  ];

  const renderCard = (card: TabCard) => (
    <TabSummaryCard
      key={card.key}
      card={card}
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
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Institution data</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {institutionCards.map(renderCard)}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Course data</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {courseCards.map(renderCard)}
            </div>
          </div>
        </CardContent>
      </Card>

      <QueuePanel jobId={job.id} />
    </div>
  );
}
