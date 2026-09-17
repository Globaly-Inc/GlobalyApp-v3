"use client";

import { useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LookupCombobox } from "@/components/lookup-combobox";
import { EligibilityLinkPicker } from "./eligibility-link-picker";
import { FeeLinkPicker } from "./fee-link-picker";
import { IntakeLinkPicker } from "./intake-link-picker";
import { StudyOptionLinkPicker } from "./study-option-link-picker";

export type CourseBulkUpdatePatch = { degree_level?: string; subject_area?: string };
export type CourseBulkLinkSelection = {
  feeIds?: string[];
  intakeIds?: string[];
  eligibilityIds?: string[];
  studyOptionIds?: string[];
};

type LinkOption = { id: string; label: string };

function LinkTags({
  items, onRemove,
}: Readonly<{ items: LinkOption[]; onRemove: (id: string) => void }>) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item.id} className="gap-1 bg-primary/10 text-xs text-primary">
          {item.label}
          <button type="button" className="cursor-pointer" title="Remove" onClick={() => onRemove(item.id)}>
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}

export function CourseBulkUpdateForm({
  jobId,
  count,
  saving,
  onCancel,
  onSave,
}: Readonly<{
  jobId: string;
  count: number;
  saving: boolean;
  onCancel: () => void;
  onSave: (patch: CourseBulkUpdatePatch, linkSelection: CourseBulkLinkSelection) => void;
}>) {
  const [degreeLevel, setDegreeLevel] = useState("");
  const [subjectArea, setSubjectArea] = useState("");
  const [fees, setFees] = useState<LinkOption[]>([]);
  const [intakes, setIntakes] = useState<LinkOption[]>([]);
  const [eligibility, setEligibility] = useState<LinkOption[]>([]);
  const [studyOptions, setStudyOptions] = useState<LinkOption[]>([]);

  const hasChange =
    degreeLevel || subjectArea || fees.length > 0 || intakes.length > 0 || eligibility.length > 0 || studyOptions.length > 0;

  const handleSave = () => {
    const patch: CourseBulkUpdatePatch = {};
    if (degreeLevel) patch.degree_level = degreeLevel;
    if (subjectArea) patch.subject_area = subjectArea;
    const linkSelection: CourseBulkLinkSelection = {};
    if (fees.length) linkSelection.feeIds = fees.map((f) => f.id);
    if (intakes.length) linkSelection.intakeIds = intakes.map((i) => i.id);
    if (eligibility.length) linkSelection.eligibilityIds = eligibility.map((e) => e.id);
    if (studyOptions.length) linkSelection.studyOptionIds = studyOptions.map((s) => s.id);
    onSave(patch, linkSelection);
  };

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base">
          Update {count} course{count === 1 ? "" : "s"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
        <div className="flex flex-col gap-1.5">
          <Label>Degree level</Label>
          <LookupCombobox
            kind="degree-levels"
            value={degreeLevel}
            onChange={setDegreeLevel}
            placeholder="Leave blank to keep unchanged"
            creatable
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Subject area</Label>
          <LookupCombobox
            kind="areas-of-study"
            value={subjectArea}
            onChange={setSubjectArea}
            placeholder="Leave blank to keep unchanged"
            creatable
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Link fees</Label>
          <LinkTags items={fees} onRemove={(id) => setFees((prev) => prev.filter((f) => f.id !== id))} />
          <FeeLinkPicker jobId={jobId} excludeIds={fees.map((f) => f.id)} onSelect={(f) => setFees((prev) => [...prev, f])} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Link intakes</Label>
          <LinkTags items={intakes} onRemove={(id) => setIntakes((prev) => prev.filter((i) => i.id !== id))} />
          <IntakeLinkPicker
            jobId={jobId}
            excludeIds={intakes.map((i) => i.id)}
            onSelect={(i) => setIntakes((prev) => [...prev, i])}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Link eligibility requirements</Label>
          <LinkTags items={eligibility} onRemove={(id) => setEligibility((prev) => prev.filter((e) => e.id !== id))} />
          <EligibilityLinkPicker
            jobId={jobId}
            excludeIds={eligibility.map((e) => e.id)}
            onSelect={(e) => setEligibility((prev) => [...prev, e])}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Link study options</Label>
          <LinkTags items={studyOptions} onRemove={(id) => setStudyOptions((prev) => prev.filter((s) => s.id !== id))} />
          <StudyOptionLinkPicker
            jobId={jobId}
            excludeIds={studyOptions.map((s) => s.id)}
            onSelect={(s) => setStudyOptions((prev) => [...prev, s])}
          />
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" className="gap-1.5 cursor-pointer" onClick={onCancel} disabled={saving}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button className="gap-1.5 cursor-pointer" disabled={saving || !hasChange} onClick={handleSave}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Apply
        </Button>
      </CardFooter>
    </Card>
  );
}
