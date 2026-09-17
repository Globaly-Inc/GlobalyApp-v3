"use client";

import { z } from "zod";
import { useState } from "react";
import { BookOpen, Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LookupCombobox } from "@/components/lookup-combobox";
import { Textarea } from "@/components/ui/textarea";
import { STUDY_MODE_OPTIONS } from "../const";
import type { CreateCourseParams } from "../apis/types";

const courseSchema = z.object({
  name: z.string().trim().min(1, "Course name is required"),
  sourceUrl: z
    .string()
    .trim()
    .refine((v) => !v || (() => { try { new URL(v); return true; } catch { return false; } })(), {
      message: "Please enter a valid URL (e.g. https://example.com)",
    })
    .transform((v) => v || null),
  degreeLevel: z.string().trim().transform((v) => v || null),
  studyMode: z.string().trim().transform((v) => v || null),
  subjectArea: z.string().trim().transform((v) => v || null),
  duration: z.string().trim().transform((v) => (v ? Number(v) || null : null)),
  description: z.string().trim().transform((v) => v || null),
});

export function CourseForm({
  saving,
  onCancel,
  onSave,
}: Readonly<{
  saving: boolean;
  onCancel: () => void;
  onSave: (values: CreateCourseParams) => void;
}>) {
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [degreeLevel, setDegreeLevel] = useState("");
  const [studyMode, setStudyMode] = useState("");
  const [subjectArea, setSubjectArea] = useState("");
  const [duration, setDuration] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    const result = courseSchema.safeParse({
      name,
      sourceUrl,
      degreeLevel,
      studyMode,
      subjectArea,
      duration,
      description,
    });

    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = String(issue.path[0]);
        if (!errs[field]) errs[field] = issue.message;
      }
      setErrors(errs);
      return;
    }

    setErrors({});
    const d = result.data;
    onSave({
      name: d.name,
      ...(d.sourceUrl ? { source_url: d.sourceUrl } : { source_url: null }),
      ...(d.degreeLevel ? { degree_level: d.degreeLevel } : { degree_level: null }),
      ...(d.studyMode ? { study_mode: d.studyMode } : { study_mode: null }),
      ...(d.subjectArea ? { subject_area: d.subjectArea } : { subject_area: null }),
      ...(d.duration ? { duration_weeks: d.duration } : { duration_weeks: null }),
      ...(d.description ? { description: d.description } : { description: null }),
    });
  };

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 text-primary" />
          Add Course
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="course-form-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="course-form-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
            }}
            placeholder="Course name"
            aria-invalid={Boolean(errors.name)}
          />
          <FieldError message={errors.name} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="course-form-source">Source URL</Label>
          <Input
            id="course-form-source"
            value={sourceUrl}
            onChange={(e) => {
              setSourceUrl(e.target.value);
              if (errors.sourceUrl) setErrors((prev) => ({ ...prev, sourceUrl: "" }));
            }}
            placeholder="https://..."
            aria-invalid={Boolean(errors.sourceUrl)}
          />
          <FieldError message={errors.sourceUrl} />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Degree level</Label>
            <LookupCombobox kind="degree-levels" value={degreeLevel} onChange={setDegreeLevel} placeholder="Select" creatable />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Study mode</Label>
            <Combobox options={STUDY_MODE_OPTIONS} value={studyMode} onChange={setStudyMode} placeholder="Select" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Subject area</Label>
            <LookupCombobox
              kind="areas-of-study"
              value={subjectArea}
              onChange={setSubjectArea}
              placeholder="Select or type subject area"
              creatable
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="course-form-duration">Duration (weeks)</Label>
            <Input
              id="course-form-duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="course-form-description">Description</Label>
          <Textarea
            id="course-form-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="gap-1.5 cursor-pointer" onClick={onCancel} disabled={saving}>
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button className="gap-1.5 cursor-pointer" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Course
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
