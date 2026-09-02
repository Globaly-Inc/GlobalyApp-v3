"use client";

import { useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LookupCombobox } from "@/components/lookup-combobox";
import { EligibilityLinkPicker } from "./eligibility-link-picker";
import { FeeLinkPicker } from "./fee-link-picker";
import { IntakeLinkPicker } from "./intake-link-picker";

export type CourseBulkUpdatePatch = { degree_level?: string; subject_area?: string };
export type CourseBulkLinkSelection = { feeId?: string; intakeId?: string; eligibilityId?: string };

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
  const [feeId, setFeeId] = useState("");
  const [intakeId, setIntakeId] = useState("");
  const [eligibilityId, setEligibilityId] = useState("");

  const hasChange = degreeLevel || subjectArea || feeId || intakeId || eligibilityId;

  const handleSave = () => {
    const patch: CourseBulkUpdatePatch = {};
    if (degreeLevel) patch.degree_level = degreeLevel;
    if (subjectArea) patch.subject_area = subjectArea;
    const linkSelection: CourseBulkLinkSelection = {};
    if (feeId) linkSelection.feeId = feeId;
    if (intakeId) linkSelection.intakeId = intakeId;
    if (eligibilityId) linkSelection.eligibilityId = eligibilityId;
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
          <Label>Link fee</Label>
          <FeeLinkPicker jobId={jobId} value={feeId} onChange={setFeeId} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Link intake</Label>
          <IntakeLinkPicker jobId={jobId} value={intakeId} onChange={setIntakeId} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Link eligibility requirement</Label>
          <EligibilityLinkPicker jobId={jobId} value={eligibilityId} onChange={setEligibilityId} />
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
