"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Award, BookOpen, CalendarDays, DollarSign, GraduationCap, Image as ImageIcon, ShieldCheck } from "lucide-react";
import { Combobox } from "@/components/combobox";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/app/personal/profile/section-card";
import { businessProfileDetailApi } from "../../../apis";
import { SectionSummaryCard } from "../section-summary-card";
import { ServiceSetupChecklist } from "../service-setup-checklist";
import { PublicBadge } from "../public-badge";
import { SummaryCardLink } from "../summary-card-link";
import { DescriptionCard } from "./description-card";
import type { DetailTab } from "../service-form-view";

const COURSE_FIELDS = [
  { key: "degree_level", label: "Degree level" },
  { key: "area_of_study", label: "Area of study" },
];

export function SummaryTab({
  serviceId,
  onNavigateTab,
  description,
  onDescriptionChange,
  schemaFieldIdByKey,
  fieldValues,
  setFieldValues,
  courseFieldOptions,
  debouncedSearchCourseField,
  courseSearchLoading,
  onWriteWithAi,
  generatingDescription,
}: Readonly<{
  serviceId: string | null;
  onNavigateTab: (tab: DetailTab) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  schemaFieldIdByKey: Record<string, number>;
  fieldValues: Record<number, unknown>;
  setFieldValues: (updater: (f: Record<number, unknown>) => Record<number, unknown>) => void;
  courseFieldOptions: (key: string, value: string) => { value: string; label: string }[];
  debouncedSearchCourseField: (key: string, query: string) => void;
  courseSearchLoading: Record<string, boolean>;
  onWriteWithAi: () => void;
  generatingDescription: boolean;
}>) {
  const [counts, setCounts] = useState({ fees: 0, intakes: 0, eligibility: 0, studyUnits: 0, accreditations: 0 });

  useEffect(() => {
    if (!serviceId) return;
    Promise.all([
      businessProfileDetailApi.serviceFees.list(serviceId),
      businessProfileDetailApi.serviceIntakes.list(serviceId),
      businessProfileDetailApi.serviceEligibility.list(serviceId),
      businessProfileDetailApi.serviceStudyUnits.list(serviceId),
      businessProfileDetailApi.getServiceAccreditations(serviceId),
    ]).then(([fees, intakes, eligibility, studyUnits, accreditations]) => {
      setCounts({ fees: fees.length, intakes: intakes.length, eligibility: eligibility.length, studyUnits: studyUnits.length, accreditations: accreditations.length });
    });
  }, [serviceId]);

  const section = (icon: LucideIcon, title: string, count: number, emptyText: string, tab: DetailTab, addLabel = "Add") => (
    <SectionSummaryCard
      icon={icon}
      title={title}
      count={count}
      badge={<PublicBadge />}
      emptyText={emptyText}
      addLabel={addLabel}
      onAdd={() => onNavigateTab(tab)}
    >
      <SummaryCardLink onClick={() => onNavigateTab(tab)}>View all {count} {title.toLowerCase()}</SummaryCardLink>
    </SectionSummaryCard>
  );

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      <div className="stagger-in flex flex-col gap-4 lg:col-span-2">
        <DescriptionCard
          description={description}
          onDescriptionChange={onDescriptionChange}
          onWriteWithAi={onWriteWithAi}
          generatingDescription={generatingDescription}
        />
        {serviceId && (
          <>
            {section(BookOpen, "Study units", counts.studyUnits, "No study units assigned yet.", "study-units", "Add unit")}
            {section(Award, "Accreditations", counts.accreditations, "No accreditations linked yet.", "accreditations")}
            {section(ShieldCheck, "Eligibility", counts.eligibility, "No eligibility requirements configured yet.", "eligibility")}
            <SectionSummaryCard icon={ImageIcon} title="Media" count={0} badge={<PublicBadge />} emptyText="No media uploaded yet." />
          </>
        )}
      </div>

      <div className="stagger-in flex flex-col gap-4">
        {serviceId && (
          <ServiceSetupChecklist
            steps={[
              { label: "Fees", done: counts.fees > 0, tab: "fees" },
              { label: "Intakes", done: counts.intakes > 0, tab: "intakes" },
              { label: "Eligibility", done: counts.eligibility > 0, tab: "eligibility" },
            ]}
            onNavigateTab={onNavigateTab}
          />
        )}
        <SectionCard icon={GraduationCap} title="Course details">
          <div className="flex flex-col gap-4">
            {COURSE_FIELDS.map((field) => {
              const fieldId = schemaFieldIdByKey[field.key];
              const value = fieldId != null && fieldValues[fieldId] != null ? String(fieldValues[fieldId]) : "";
              return (
                <div key={field.key} className="flex flex-col gap-2">
                  <Label>{field.label}</Label>
                  <Combobox
                    options={courseFieldOptions(field.key, value)}
                    value={value}
                    onChange={(v) => {
                      if (fieldId != null) setFieldValues((f) => ({ ...f, [fieldId]: v }));
                    }}
                    onQueryChange={(query) => debouncedSearchCourseField(field.key, query)}
                    loading={courseSearchLoading[field.key] ?? false}
                    disabled={fieldId == null}
                    placeholder={fieldId == null ? "Not set up for this category yet" : `Select ${field.label.toLowerCase()}`}
                    searchPlaceholder={`Search ${field.label.toLowerCase()}...`}
                  />
                  {fieldId == null && (
                    <p className="text-xs text-muted-foreground">
                      An admin needs to add a &quot;{field.label}&quot; field to this service category before it can be set here.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>

        {serviceId && (
          <>
            {section(DollarSign, "Course fees", counts.fees, "No fees configured yet.", "fees")}
            {section(CalendarDays, "Intakes", counts.intakes, "No intakes configured yet.", "intakes")}
          </>
        )}
      </div>
    </div>
  );
}
