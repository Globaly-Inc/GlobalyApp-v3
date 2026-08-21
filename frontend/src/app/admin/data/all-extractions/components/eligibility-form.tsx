"use client";

import { z } from "zod";
import { useEffect, useState } from "react";
import { GraduationCap, Languages, Loader2, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { categoriesApi } from "@/app/admin/platform/categories/apis";
import {
  ACADEMIC_TEST_OPTIONS, APPLICABLE_TO_OPTIONS, ENGLISH_SUBSCORES, ENGLISH_TEST_OPTIONS, SCORE_TYPE_OPTIONS,
} from "../const";
import type { AcademicTest, EligibilityParams, EligibilityRequirement, LanguageTest } from "../apis/types";

const ANY_DEGREE = "__any__";

const eligibilitySchema = z.object({
  name: z.string().trim().min(1, "Requirement name is required"),
  score: z
    .string()
    .trim()
    .refine((v) => !v || !Number.isNaN(Number(v)), {
      message: "Score must be a valid number",
    })
    .transform((v) => (v ? Number(v) : null)),
  applicableTo: z.string().default("both"),
  degreeLevel: z.string().trim(),
  scoreType: z.string().default("percentage"),
  description: z.string().trim().transform((v) => v || null),
});

export function EligibilityForm({
  requirement,
  saving,
  onCancel,
  onSave,
}: Readonly<{
  requirement?: EligibilityRequirement;
  saving: boolean;
  onCancel: () => void;
  onSave: (values: EligibilityParams) => void;
}>) {
  const [applicableTo, setApplicableTo] = useState(requirement?.applicable_to ?? "both");
  const [name, setName] = useState(requirement?.name ?? "");
  const [degreeLevel, setDegreeLevel] = useState(requirement?.min_degree_level ?? ANY_DEGREE);
  const [scoreType, setScoreType] = useState(requirement?.score_type ?? "percentage");
  const [score, setScore] = useState(
    (requirement?.min_score_percent ?? requirement?.min_score)?.toString() ?? "",
  );
  const [description, setDescription] = useState(requirement?.description ?? "");
  const [languageTests, setLanguageTests] = useState<LanguageTest[]>(requirement?.language_tests ?? []);
  const [academicTests, setAcademicTests] = useState<AcademicTest[]>(requirement?.academic_tests ?? []);
  const [degreeLevels, setDegreeLevels] = useState<{ value: string; label: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    categoriesApi.getLookups("degree-levels", { limit: 100 })
      .then((res) => setDegreeLevels(res.data.map((d) => ({ value: d.name, label: d.name }))))
      .catch(() => setDegreeLevels([]));
  }, []);

  const isPercentage = scoreType === "percentage";
  const scoreLabel = SCORE_TYPE_OPTIONS.find((o) => o.value === scoreType)?.label ?? "Score";

  const patchLanguage = (index: number, patch: Partial<LanguageTest>) =>
    setLanguageTests((list) => list.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const patchAcademic = (index: number, patch: Partial<AcademicTest>) =>
    setAcademicTests((list) => list.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const handleSave = () => {
    const result = eligibilitySchema.safeParse({
      name,
      score,
      applicableTo,
      degreeLevel,
      scoreType,
      description,
    });

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
    const d = result.data;
    onSave({
      name: d.name,
      applicable_to: d.applicableTo,
      min_degree_level: d.degreeLevel === ANY_DEGREE || !d.degreeLevel ? null : d.degreeLevel,
      score_type: d.scoreType,
      min_score_percent: isPercentage ? d.score : null,
      min_score: isPercentage ? null : d.score,
      description: d.description,
      language_tests: languageTests.filter((t) => t.test_type_name.trim()),
      academic_tests: academicTests.filter((t) => t.test_name.trim()),
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
      <CardContent className="flex flex-col gap-4">
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
                  onChange={() => setApplicableTo(option.value)}
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
                options={[{ value: ANY_DEGREE, label: "— Any —" }, ...degreeLevels]}
                value={degreeLevel}
                onChange={setDegreeLevel}
                placeholder="— Any —"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Score Type</Label>
              <Combobox options={SCORE_TYPE_OPTIONS} value={scoreType} onChange={setScoreType} placeholder="Select" />
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
                placeholder={isPercentage ? "e.g. 65" : "e.g. 3.0"}
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
              onClick={() =>
                setLanguageTests((list) => [
                  ...list,
                  { test_type_name: "IELTS", overall_score: "6.5" },
                ])
              }
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
                    value={test.test_type_name}
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
                {ENGLISH_SUBSCORES.map(({ key }) => (
                  <Input
                    key={key}
                    value={(test as any)[key]?.toString() ?? ""}
                    onChange={(e) => patchLanguage(index, { [key]: e.target.value ? Number(e.target.value) : null })}
                    placeholder={key.charAt(0).toUpperCase() + key.slice(1)}
                    className="h-8 text-xs"
                    inputMode="decimal"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold">
              <GraduationCap className="h-4 w-4 text-primary" /> Academic Tests
            </h4>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs cursor-pointer"
              onClick={() => setAcademicTests((list) => [...list, { test_name: "SAT", score: "1200" }])}
            >
              <Plus className="mr-1 h-3 w-3" /> Add Test
            </Button>
          </div>
          {academicTests.map((test, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="w-48">
                <Combobox
                  options={ACADEMIC_TEST_OPTIONS}
                  value={test.test_name}
                  onChange={(v) => patchAcademic(index, { test_name: v })}
                  placeholder="Select test"
                  creatable
                />
              </div>
              <Input
                value={test.score}
                onChange={(e) => patchAcademic(index, { score: e.target.value })}
                placeholder="Min score"
                className="h-10 w-40"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 cursor-pointer"
                title="Remove test"
                onClick={() => setAcademicTests((list) => list.filter((_, i) => i !== index))}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="cursor-pointer" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button className="gap-1.5 cursor-pointer" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {requirement ? "Save" : "Create"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
