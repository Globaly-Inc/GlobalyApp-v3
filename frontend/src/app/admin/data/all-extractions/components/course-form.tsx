"use client";

import { useEffect, useState } from "react";
import { BookOpen, Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { categoriesApi } from "@/app/admin/platform/categories/apis";
import { STUDY_MODE_OPTIONS } from "../const";
import type { CreateCourseParams } from "../apis/types";

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
  const [degreeLevels, setDegreeLevels] = useState<{ value: string; label: string }[]>([]);
  const [subjectAreas, setSubjectAreas] = useState<{ value: string; label: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    categoriesApi.getLookups("degree-levels", { limit: 100 })
      .then((res) => setDegreeLevels(res.data.map((d) => ({ value: d.name, label: d.name }))))
      .catch(() => setDegreeLevels([]));
    categoriesApi.getLookups("areas-of-study", { limit: 100 })
      .then((res) => setSubjectAreas(res.data.map((a) => ({ value: a.name, label: a.name }))))
      .catch(() => setSubjectAreas([]));
  }, []);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) {
      errs.name = "Course name is required";
    }
    if (sourceUrl.trim()) {
      try {
        new URL(sourceUrl.trim());
      } catch {
        errs.sourceUrl = "Please enter a valid URL (e.g. https://example.com)";
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({
      name: name.trim(),
      ...(sourceUrl.trim() ? { source_url: sourceUrl.trim() } : {}),
      ...(degreeLevel ? { degree_level: degreeLevel } : {}),
      ...(studyMode ? { study_mode: studyMode } : {}),
      ...(subjectArea.trim() ? { subject_area: subjectArea.trim() } : {}),
      ...(duration.trim() ? { duration_weeks: Number(duration) } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
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
            <Combobox
              options={degreeLevels}
              value={degreeLevel}
              onChange={setDegreeLevel}
              placeholder="Select"
              loading={degreeLevels.length === 0}
              creatable
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Study mode</Label>
            <Combobox options={STUDY_MODE_OPTIONS} value={studyMode} onChange={setStudyMode} placeholder="Select" creatable />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Subject area</Label>
            <Combobox
              options={subjectAreas}
              value={subjectArea}
              onChange={setSubjectArea}
              placeholder="Select or type subject area"
              loading={subjectAreas.length === 0}
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
