"use client";

import { useEffect, useState } from "react";
import { Award, BookOpen, CalendarDays, DollarSign, FileText, GraduationCap, Image as ImageIcon, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/app/personal/profile/section-card";
import { businessProfileDetailApi } from "../../../apis";
import { SectionSummaryCard } from "../section-summary-card";
import { ServiceSetupChecklist } from "../service-setup-checklist";
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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Description
            </CardTitle>
            <CardAction>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-primary"
                onClick={() => toast("Coming soon", { description: "AI-generated descriptions aren't available yet." })}
              >
                <Sparkles className="h-3.5 w-3.5" /> Write with AI
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Textarea
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Describe the service..."
              rows={8}
              className="min-h-20"
            />
          </CardContent>
        </Card>

        {serviceId && (
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
              addLabel="Add"
              onAdd={() => onNavigateTab("eligibility")}
            />
            <Card className="gap-3">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  Media <Badge variant="secondary" className="text-[10px]">Public</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground italic">No media uploaded yet.</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="space-y-4">
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

        {serviceId && (
          <>
            <SectionSummaryCard
              icon={DollarSign}
              title="Course fees"
              count={counts.fees}
              emptyText="No fees configured yet."
              addLabel="Add"
              onAdd={() => onNavigateTab("fees")}
            />
            <SectionSummaryCard
              icon={CalendarDays}
              title="Intakes"
              count={counts.intakes}
              emptyText="No intakes configured yet."
              addLabel="Add"
              onAdd={() => onNavigateTab("intakes")}
            />
            <ServiceSetupChecklist
              steps={[
                { label: "Fees", done: counts.fees > 0 },
                { label: "Intakes", done: counts.intakes > 0 },
                { label: "Eligibility", done: counts.eligibility > 0 },
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
}
