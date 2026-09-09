"use client";

import { GraduationCap, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACADEMIC_TEST_OPTIONS } from "../const";
import type { AcademicTest } from "../apis/types";

/**
 * The standardised-admission-test rows of an eligibility requirement (GRE, GMAT, SAT, …).
 *
 * Split out of eligibility-form.tsx to keep that file inside the 300-line limit once the
 * optional flag was added. A test the institution calls optional must be recorded as optional:
 * stored as a hard minimum it fails students on a bar the course never set, and the extractor
 * used to have nowhere to put a test at all, so these arrived as fake grade requirements
 * ("GMAT Quantitative Score", score_type: percentage, min_score: 95 read off a percentile).
 */
export function EligibilityAcademicTests({
  tests, onChange,
}: Readonly<{
  tests: AcademicTest[];
  onChange: (next: AcademicTest[]) => void;
}>) {
  const patch = (index: number, changes: Partial<AcademicTest>) =>
    onChange(tests.map((t, i) => (i === index ? { ...t, ...changes } : t)));

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold">
          <GraduationCap className="h-4 w-4 text-primary" /> Academic Tests
        </h4>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs cursor-pointer"
          onClick={() => onChange([...tests, { test_name: "SAT", score: "1200", is_optional: false }])}
        >
          <Plus className="mr-1 h-3 w-3" /> Add Test
        </Button>
      </div>
      {tests.map((test, index) => (
        <div key={index} className="flex flex-wrap items-center gap-3">
          <div className="w-48">
            <Combobox
              options={ACADEMIC_TEST_OPTIONS}
              value={test.test_name ?? ""}
              onChange={(v) => patch(index, { test_name: v })}
              placeholder="Select test"
              creatable
            />
          </div>
          <Input
            value={test.score ?? ""}
            onChange={(e) => patch(index, { score: e.target.value })}
            placeholder="Min score"
            className="h-10 w-32"
            title="A minimum the applicant must clear. Leave blank if the page states no floor."
          />
          {/*
            Kept distinct from Min score on purpose. Pages routinely report what admitted students
            scored ("average GMAT 49.5") while stating no minimum at all — putting that figure in
            Min score invents a requirement and fails students against it.
          */}
          <Input
            value={test.typical_score ?? ""}
            onChange={(e) => patch(index, { typical_score: e.target.value })}
            placeholder="Typical score"
            className="h-10 w-32"
            title="What admitted students scored (average/median). Shown as context, never used to judge eligibility."
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id={`academic-test-optional-${index}`}
              checked={test.is_optional === true}
              onCheckedChange={(checked) => patch(index, { is_optional: checked === true })}
            />
            <Label htmlFor={`academic-test-optional-${index}`} className="cursor-pointer text-xs font-normal">
              Optional
            </Label>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto shrink-0 cursor-pointer"
            title="Remove test"
            onClick={() => onChange(tests.filter((_, i) => i !== index))}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
