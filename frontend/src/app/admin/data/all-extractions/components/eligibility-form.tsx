"use client";

import { useEffect, useState } from "react";
import { GraduationCap, Languages, Loader2, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { categoriesApi } from "@/app/admin/platform/categories/apis";
import {
  ACADEMIC_TEST_OPTIONS, APPLICABLE_TO_OPTIONS, ENGLISH_SUBSCORES, ENGLISH_TEST_OPTIONS, SCORE_TYPE_OPTIONS,
} from "../const";
import type { AcademicTest, EligibilityParams, EligibilityRequirement, LanguageTest } from "../apis/types";

const ANY_DEGREE = "__any__";

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
            <Label htmlFor="eligibility-name">Requirement Name</Label>
            <Input
              id="eligibility-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Academic Entry"
            />
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
                onChange={(e) => setScore(e.target.value)}
                inputMode="decimal"
                placeholder={isPercentage ? "e.g. 65" : "e.g. 3.0"}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eligibility-description">Description</Label>
            <Textarea
              id="eligibility-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Languages className="h-3.5 w-3.5 text-primary" />
              English language tests
            </p>
            <Button
              variant="outline" size="sm" className="h-7 gap-1.5 text-xs cursor-pointer"
              onClick={() => setLanguageTests((list) => [...list, { test_type_name: "", overall_score: "" }])}
            >
              <Plus className="h-3 w-3" />
              Add Test
            </Button>
          </div>
          {languageTests.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">No English test requirements added.</p>
          ) : (
            languageTests.map((test, index) => (
              <div key={index} className="flex flex-col gap-3 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Combobox
                    options={ENGLISH_TEST_OPTIONS}
                    value={test.test_type_name}
                    onChange={(v) => patchLanguage(index, { test_type_name: v })}
                    placeholder="Select test"
                    className="h-9 flex-1"
                    creatable
                  />
                  <Label className="shrink-0 text-xs text-muted-foreground">Overall</Label>
                  <Input
                    value={test.overall_score}
                    onChange={(e) => patchLanguage(index, { overall_score: e.target.value })}
                    placeholder="6.5"
                    className="h-9 w-24"
                  />
                  <Button
                    variant="ghost" size="icon-sm" className="shrink-0 cursor-pointer"
                    title="Remove test" onClick={() => setLanguageTests((list) => list.filter((_, i) => i !== index))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {ENGLISH_SUBSCORES.map(({ key, label }) => (
                    <div key={key} className="flex flex-col gap-1">
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
                      <Input
                        value={test[key] ?? ""}
                        onChange={(e) => patchLanguage(index, { [key]: e.target.value })}
                        placeholder="—"
                        className="h-9"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5 text-primary" />
              Standardized academic tests
            </p>
            <Button
              variant="outline" size="sm" className="h-7 gap-1.5 text-xs cursor-pointer"
              onClick={() => setAcademicTests((list) => [...list, { test_name: "", score: "" }])}
            >
              <Plus className="h-3 w-3" />
              Add Test
            </Button>
          </div>
          {academicTests.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">No standardized test requirements added.</p>
          ) : (
            academicTests.map((test, index) => (
              <div key={index} className="flex items-center gap-2">
                <Combobox
                  options={ACADEMIC_TEST_OPTIONS}
                  value={test.test_name}
                  onChange={(v) => patchAcademic(index, { test_name: v })}
                  placeholder="Select test"
                  className="h-9 flex-1"
                  creatable
                />
                <Input
                  value={test.score}
                  onChange={(e) => patchAcademic(index, { score: e.target.value })}
                  placeholder="Min score"
                  className="h-9 w-40"
                />
                <Button
                  variant="ghost" size="icon-sm" className="shrink-0 cursor-pointer"
                  title="Remove test" onClick={() => setAcademicTests((list) => list.filter((_, i) => i !== index))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="cursor-pointer" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="gap-1.5 cursor-pointer"
            disabled={saving}
            onClick={() => {
              if (!name.trim()) {
                toast.error("Requirement name is required");
                return;
              }
              const numeric = score.trim() === "" ? null : Number(score);
              onSave({
                name: name.trim(),
                applicable_to: applicableTo,
                min_degree_level: degreeLevel === ANY_DEGREE ? null : degreeLevel,
                score_type: scoreType,
                // percentage lands in its own column; anything else in min_score
                min_score_percent: isPercentage ? numeric : null,
                min_score: isPercentage ? null : numeric,
                description: description.trim() || null,
                language_tests: languageTests.filter((t) => t.test_type_name.trim()),
                academic_tests: academicTests.filter((t) => t.test_name.trim()),
              });
            }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {requirement ? "Save" : "Create"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
