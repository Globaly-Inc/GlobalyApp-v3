"use client";

import { useEffect, useState } from "react";
import { Award, BookOpen, CalendarDays, DollarSign, GraduationCap, Image as ImageIcon, ShieldCheck } from "lucide-react";
import { Combobox } from "@/components/combobox";
import { Label } from "@/components/ui/label";
import { PrivacyBadge } from "@/components/privacy-badge";
import { OneToManySection, SectionCard } from "@/app/personal/profile/section-card";
import { businessProfileDetailApi } from "../../../apis";
import { SectionSummaryCard } from "../section-summary-card";
import { ServiceBranchSharing } from "../service-branch-sharing";
import { ServiceDescriptionCard } from "../service-description-card";
import { ServiceSetupChecklist } from "../service-setup-checklist";
import type { DetailTab } from "../service-form-view";

// The three the Course details card offers, matching V1's editor and the superadmin one.
const COURSE_FIELDS = [
  { key: "degree_level", label: "Degree level" },
  { key: "area_of_study", label: "Area of study" },
  { key: "awarded_by", label: "Awarded by" },
];

export function SummaryTab({
  serviceId,
  orgBase,
  isCourse,
  onNavigateTab,
  description,
  onDescriptionChange,
  schemaFieldIdByKey,
  fieldValues,
  setFieldValues,
  courseFieldOptions,
  debouncedSearchCourseField,
  courseSearchLoading,
}: Readonly<{
  serviceId: string | null;
  orgBase: string;
  /** Course-shaped categories get the academic sections; everything else gets description + fees. */
  isCourse: boolean;
  onNavigateTab: (tab: DetailTab) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  schemaFieldIdByKey: Record<string, number>;
  fieldValues: Record<number, unknown>;
  setFieldValues: (updater: (f: Record<number, unknown>) => Record<number, unknown>) => void;
  courseFieldOptions: (key: string, value: string) => { value: string; label: string }[];
  debouncedSearchCourseField: (key: string, query: string) => void;
  courseSearchLoading: Record<string, boolean>;
}>) {
  const [counts, setCounts] = useState({ fees: 0, intakes: 0, eligibility: 0, studyUnits: 0, accreditations: 0 });

  useEffect(() => {
    if (!serviceId) return;
    Promise.all([
      businessProfileDetailApi.serviceFees.list(serviceId, orgBase),
      businessProfileDetailApi.serviceIntakes.list(serviceId, orgBase),
      businessProfileDetailApi.serviceEligibility.list(serviceId, orgBase),
      businessProfileDetailApi.serviceStudyUnits.list(serviceId, orgBase),
      businessProfileDetailApi.getServiceAccreditations(serviceId, orgBase),
    ]).then(([fees, intakes, eligibility, studyUnits, accreditations]) => {
      setCounts({ fees: fees.length, intakes: intakes.length, eligibility: eligibility.length, studyUnits: studyUnits.length, accreditations: accreditations.length });
    });
  }, [serviceId, orgBase]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <ServiceDescriptionCard description={description} onChange={onDescriptionChange} />

        {serviceId && isCourse && (
          <>
            <SectionSummaryCard
              icon={BookOpen}
              title="Study units"
              count={counts.studyUnits}
              emptyText="No study units assigned yet."
              addLabel="Add unit"
              onAdd={() => onNavigateTab("study-units")}
            />
            <SectionSummaryCard
              icon={Award}
              title="Accreditations"
              count={counts.accreditations}
              emptyText="No accreditations linked yet."
              addLabel="Add"
              onAdd={() => onNavigateTab("accreditations")}
            />
            <SectionSummaryCard
              icon={ShieldCheck}
              title="Eligibility"
              count={counts.eligibility}
              emptyText="No eligibility requirements configured yet."
              onAdd={() => onNavigateTab("eligibility")}
            />
          </>
        )}

        {/* Not course-only: every service can carry photos, so V1 shows this whatever the category. */}
        {serviceId && (
          <OneToManySection
            icon={ImageIcon}
            title="Media"
            count={0}
            badge={<PrivacyBadge isPublic />}
            emptyText="No media uploaded yet."
          >
            {null}
          </OneToManySection>
        )}
      </div>

      <div className="space-y-4">
        {isCourse && (
        <SectionCard icon={GraduationCap} title="Course details">
          <div className="space-y-4">
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
        )}

        {serviceId && (
          <>
            {/* "Course fees" whatever the category, as V1 titles it — only the tab drops the prefix. */}
            <SectionSummaryCard
              icon={DollarSign}
              title="Course fees"
              count={counts.fees}
              emptyText="No fees configured yet."
              onAdd={() => onNavigateTab("fees")}
            />
            {isCourse && (
              <SectionSummaryCard
                icon={CalendarDays}
                title="Intakes"
                count={counts.intakes}
                emptyText="No intakes configured yet."
                onAdd={() => onNavigateTab("intakes")}
              />
            )}
            <ServiceBranchSharing serviceId={serviceId} orgBase={orgBase} />
            {/* Intakes and eligibility are academic concepts — a non-course service would never
                tick them off, so its checklist stops at description and fees. */}
            <ServiceSetupChecklist
              steps={isCourse
                ? [
                  { label: "Description", done: description.trim().length > 0 },
                  { label: "Fees", done: counts.fees > 0 },
                  { label: "Intakes", done: counts.intakes > 0 },
                  { label: "Eligibility", done: counts.eligibility > 0 },
                ]
                : [
                  { label: "Description", done: description.trim().length > 0 },
                  { label: "Fees", done: counts.fees > 0 },
                ]}
            />
          </>
        )}
      </div>
    </div>
  );
}
