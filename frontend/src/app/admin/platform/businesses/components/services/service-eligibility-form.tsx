"use client";

import { useState } from "react";
import { z } from "zod";
import { GraduationCap, Languages, Loader2, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ENGLISH_SUBSCORES, ENGLISH_TEST_OPTIONS, SCORE_TYPE_OPTIONS } from "@/app/admin/data/all-extractions/const";
import { EligibilityAcademicTests } from "@/app/admin/data/all-extractions/components/eligibility-academic-tests";
import { useAppSelector } from "@/lib/hooks";
import type { ServiceAcademicTest, ServiceEligibility, ServiceEligibilityInput, ServiceLanguageTest } from "../../apis/types";

// Same-to-same reuse of the data-extraction "Create Eligibility" form (eligibility-form.tsx) —
// same radio-style applicable-to, score type + score, English-test subscore grid, and the
// EligibilityAcademicTests component itself — adapted to this schema's numeric degree_level_id
// (FK to degree_levels) in place of the extraction's free-text min_degree_level.
const APPLICABLE_TO_OPTIONS = [
  { value: "domestic", label: "Domestic" },
  { value: "international", label: "International" },
  { value: "both", label: "Both" },
];

const eligibilitySchema = z.object({
  name: z.string().trim().min(1, "Requirement name is required"),
  score: z.string().trim().refine((v) => !v || !Number.isNaN(Number(v)), { message: "Score must be a valid number" }),
});

export function ServiceEligibilityForm({
  requirement,
  saving,
  onCancel,
  onSave,
}: Readonly<{
  requirement?: ServiceEligibility;
  saving: boolean;
  onCancel: () => void;
  onSave: (values: ServiceEligibilityInput) => void;
}>) {
  const degreeLevels = useAppSelector((s) => s.platformCategories.degreeLevels.data);
  const [applicableTo, setApplicableTo] = useState<ServiceEligibilityInput["applicable_to"]>(requirement?.applicable_to ?? "both");
  const [name, setName] = useState(requirement?.name ?? "");
  const [degreeLevelId, setDegreeLevelId] = useState(requirement?.degree_level_id ? String(requirement.degree_level_id) : "");
  const [scoreType, setScoreType] = useState<ServiceEligibilityInput["score_type"]>(requirement?.score_type ?? "percentage");
  const [score, setScore] = useState(requirement?.min_score?.toString() ?? "");
  const [description, setDescription] = useState(requirement?.description ?? "");
  const [languageTests, setLanguageTests] = useState<ServiceLanguageTest[]>(requirement?.language_tests ?? []);
  const [academicTests, setAcademicTests] = useState<ServiceAcademicTest[]>(requirement?.academic_tests ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const scoreLabel = SCORE_TYPE_OPTIONS.find((o) => o.value === scoreType)?.label ?? "Score";

  const patchLanguage = (index: number, patch: Partial<ServiceLanguageTest>) =>
    setLanguageTests((list) => list.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const handleSave = () => {
    const result = eligibilitySchema.safeParse({ name, score });
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0]);
        if (!errs[key]) errs[key] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    onSave({
      name,
      applicable_to: applicableTo,
      degree_level_id: degreeLevelId ? Number(degreeLevelId) : null,
      score_type: scoreType,
      min_score: score ? Number(score) : null,
      description: description || null,
      language_tests: languageTests.filter((t) => t.test_type_name?.trim()),
      academic_tests: academicTests.filter((t) => t.test_name?.trim()),
    });
  };

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="h-4 w-4 text-primary" />
          {requirement ? "Edit Eligibility" : "Create Eligibility"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Applicable to</Label>
          <div className="flex flex-wrap items-center gap-6">
            {APPLICABLE_TO_OPTIONS.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="applicable-to"
                  className="accent-primary"
                  checked={applicableTo === option.value}
                  onChange={() => setApplicableTo(option.value as ServiceEligibilityInput["applicable_to"])}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eligibility-name">
              Requirement Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="eligibility-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
              }}
              placeholder="e.g. Standard Academic Entry"
              aria-invalid={Boolean(errors.name)}
            />
            <FieldError message={errors.name} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Min Degree Level</Label>
              <Combobox
                options={degreeLevels.map((d) => ({ value: String(d.id), label: d.name }))}
                value={degreeLevelId}
                onChange={setDegreeLevelId}
                placeholder="— Any —"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Score Type</Label>
              <Combobox
                options={SCORE_TYPE_OPTIONS}
                value={scoreType ?? "percentage"}
                onChange={(v) => setScoreType(v as ServiceEligibilityInput["score_type"])}
                placeholder="Select"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eligibility-score">{scoreLabel}</Label>
              <Input
                id="eligibility-score"
                value={score}
                onChange={(e) => {
                  setScore(e.target.value);
                  if (errors.score) setErrors((prev) => ({ ...prev, score: "" }));
                }}
                inputMode="decimal"
                placeholder={scoreType === "percentage" ? "e.g. 65" : "e.g. 3.0"}
                aria-invalid={Boolean(errors.score)}
              />
              <FieldError message={errors.score} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eligibility-description">Notes / Remarks</Label>
            <Textarea
              id="eligibility-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Internal notes or special conditions…"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold">
              <Languages className="h-4 w-4 text-primary" /> English Tests
            </h4>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs cursor-pointer"
              onClick={() => setLanguageTests((list) => [...list, { test_type_name: "IELTS", overall_score: "6.5" }])}
            >
              <Plus className="mr-1 h-3 w-3" /> Add Test
            </Button>
          </div>
          {languageTests.map((test, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-md bg-muted/30 p-3">
              <div className="flex items-center gap-3">
                <div className="w-48">
                  <Combobox
                    options={ENGLISH_TEST_OPTIONS}
                    value={test.test_type_name ?? ""}
                    onChange={(v) => patchLanguage(index, { test_type_name: v })}
                    placeholder="Select test"
                    creatable
                  />
                </div>
                <Input
                  value={test.overall_score ?? ""}
                  onChange={(e) => patchLanguage(index, { overall_score: e.target.value })}
                  placeholder="Overall score"
                  className="h-10 w-32"
                  inputMode="decimal"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto cursor-pointer"
                  title="Remove test"
                  onClick={() => setLanguageTests((list) => list.filter((_, i) => i !== index))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ENGLISH_SUBSCORES.map(({ key, label }) => (
                  <Input
                    key={key}
                    value={test[key] ?? ""}
                    onChange={(e) => patchLanguage(index, { [key]: e.target.value })}
                    placeholder={label}
                    className="h-8 text-xs"
                    inputMode="decimal"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <EligibilityAcademicTests tests={academicTests} onChange={setAcademicTests} />
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" className="cursor-pointer" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button className="gap-1.5 cursor-pointer" disabled={saving} onClick={handleSave}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {requirement ? "Save" : "Create"}
        </Button>
      </CardFooter>
    </Card>
  );
}
