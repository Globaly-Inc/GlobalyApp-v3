"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEGREE_LEVELS, FIELDS_OF_STUDY } from "../static/onboarding-content";
import type { Qualification, QualificationInput } from "../apis/types";

const GRADING_SYSTEMS = [
  { value: "gpa_4", label: "GPA (4.0 scale)" },
  { value: "gpa_5", label: "GPA (5.0 scale)" },
  { value: "gpa_7", label: "GPA (7.0 scale)" },
  { value: "gpa_10", label: "GPA (10.0 scale)" },
  { value: "percentage", label: "Percentage" },
  { value: "letter_grade", label: "Letter Grade" },
  { value: "pass_fail", label: "Pass / Fail" },
  { value: "other", label: "Other" },
];

function toInput(item: Qualification | null): QualificationInput {
  return {
    qualification_type: item?.qualification_type ?? "",
    degree_title: item?.degree_title ?? "",
    subject_area: item?.subject_area ?? "",
    institution_name: item?.institution_name ?? "",
    grading_system: item?.grading_system ?? "",
    grade_value: item?.grade_value ?? "",
    is_current: item?.is_current ?? false,
    start_date: item?.start_date ?? "",
    end_date: item?.end_date ?? "",
    sort_order: item?.sort_order ?? 0,
  };
}

export function QualificationDialog({
  open,
  onOpenChange,
  item,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: Qualification | null;
  onSave: (data: QualificationInput) => Promise<boolean>;
  saving: boolean;
}>) {
  const [form, setForm] = useState<QualificationInput>(() => toInput(item));

  const handleOpenChange = (next: boolean) => {
    if (next) setForm(toInput(item));
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!(await onSave(form))) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit Education" : "Add Education"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Degree Level</Label>
            <Select value={form.qualification_type ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, qualification_type: v }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select degree level" /></SelectTrigger>
              <SelectContent>
                {DEGREE_LEVELS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Degree Title</Label>
            <Input
              value={form.degree_title ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, degree_title: e.target.value }))}
              placeholder="e.g. Bachelor of Computer Science"
            />
          </div>
          <div className="space-y-2">
            <Label>Subject Area</Label>
            <Select value={form.subject_area ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, subject_area: v }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select subject area" /></SelectTrigger>
              <SelectContent>
                {FIELDS_OF_STUDY.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Institution</Label>
            <Input
              value={form.institution_name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, institution_name: e.target.value }))}
              placeholder="e.g. University of Melbourne"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Grading System</Label>
              <Select value={form.grading_system ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, grading_system: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {GRADING_SYSTEMS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Grade</Label>
              <Input value={form.grade_value ?? ""} onChange={(e) => setForm((f) => ({ ...f, grade_value: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Date (MM/YYYY)</Label>
              <Input
                value={form.start_date ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                placeholder="09/2020"
              />
            </div>
            <div className="space-y-2">
              <Label>End Date (MM/YYYY)</Label>
              <Input
                value={form.end_date ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                placeholder="06/2024"
                disabled={form.is_current}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.is_current}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, is_current: checked === true, end_date: checked ? "" : f.end_date }))}
            />
            Currently studying here
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
