"use client";

import { z } from "zod";
import { useState } from "react";
import { BookMarked, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UNIT_TYPE_OPTIONS } from "../const";
import type { StudyUnit, StudyUnitParams } from "../apis/types";

const studyUnitSchema = z.object({
  name: z.string().trim().min(1, "Unit name is required"),
  code: z.string().trim(),
  points: z
    .string()
    .trim()
    .refine((v) => !v || !Number.isNaN(Number(v)), { message: "Credit points must be a valid number" }),
  type: z.string(),
  description: z.string().trim(),
});

export function StudyUnitForm({
  unit,
  saving,
  onCancel,
  onSave,
}: Readonly<{
  unit?: StudyUnit;
  saving: boolean;
  onCancel: () => void;
  onSave: (values: StudyUnitParams & { unit_name: string }) => void;
}>) {
  const [code, setCode] = useState(unit?.unit_code ?? "");
  const [points, setPoints] = useState(unit?.credit_points?.toString() ?? "");
  const [name, setName] = useState(unit?.unit_name ?? "");
  const [type, setType] = useState(unit?.unit_type ?? "compulsory");
  const [description, setDescription] = useState(unit?.description ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookMarked className="h-4 w-4 text-primary" />
          {unit ? "Edit Study Unit" : "Add Study Unit"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unit-code">Unit Code</Label>
            <Input id="unit-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. COMP1010" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unit-points">Credit Points</Label>
            <Input
              id="unit-points"
              value={points}
              onChange={(e) => {
                setPoints(e.target.value);
                if (errors.points) setErrors((prev) => ({ ...prev, points: "" }));
              }}
              inputMode="numeric"
              placeholder="e.g. 6"
              aria-invalid={Boolean(errors.points)}
            />
            <FieldError message={errors.points} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="unit-name">
            Unit Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="unit-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
            }}
            placeholder="e.g. Introduction to Computer Science"
            aria-invalid={Boolean(errors.name)}
          />
          <FieldError message={errors.name} />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Unit Type</Label>
          <div className="flex flex-wrap items-center gap-6">
            {UNIT_TYPE_OPTIONS.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="unit-type"
                  className="accent-primary"
                  checked={type === option.value}
                  onChange={() => setType(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="unit-description">Description</Label>
          <Textarea
            id="unit-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Brief description…"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="cursor-pointer" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="gap-1.5 cursor-pointer"
            disabled={saving}
            onClick={() => {
              const result = studyUnitSchema.safeParse({ name, code, points, type, description });
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
                unit_name: d.name,
                unit_code: d.code || null,
                credit_points: d.points === "" ? null : Number(d.points),
                unit_type: d.type,
                description: d.description || null,
              });
            }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {unit ? "Save" : "Add"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
