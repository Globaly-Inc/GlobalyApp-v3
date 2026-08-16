"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CountryPanelProps } from "../types";

export function CountryEducationPanel({ country, onChange }: CountryPanelProps) {
  return (
    <Card>
      <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="edu-tuition-min">Avg. tuition min</Label>
          <Input
            className="h-10"
            id="edu-tuition-min"
            type="number"
            value={country.avg_tuition_min ?? ""}
            onChange={(e) => onChange({ avg_tuition_min: e.target.value ? Number(e.target.value) : null })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edu-tuition-max">Avg. tuition max</Label>
          <Input
            className="h-10"
            id="edu-tuition-max"
            type="number"
            value={country.avg_tuition_max ?? ""}
            onChange={(e) => onChange({ avg_tuition_max: e.target.value ? Number(e.target.value) : null })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edu-tuition-currency">Tuition currency</Label>
          <Input
            className="h-10"
            id="edu-tuition-currency"
            value={country.avg_tuition_currency ?? ""}
            onChange={(e) => onChange({ avg_tuition_currency: e.target.value || null })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edu-student-count">Student count label</Label>
          <Input
            className="h-10"
            id="edu-student-count"
            value={country.student_count_label ?? ""}
            onChange={(e) => onChange({ student_count_label: e.target.value || null })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edu-universities-count">Universities count label</Label>
          <Input
            className="h-10"
            id="edu-universities-count"
            value={country.universities_count_label ?? ""}
            onChange={(e) => onChange({ universities_count_label: e.target.value || null })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edu-cost-of-living">Cost of living label</Label>
          <Input
            className="h-10"
            id="edu-cost-of-living"
            value={country.cost_of_living_label ?? ""}
            onChange={(e) => onChange({ cost_of_living_label: e.target.value || null })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edu-work-rights">Work rights label</Label>
          <Input
            className="h-10"
            id="edu-work-rights"
            value={country.work_rights_label ?? ""}
            onChange={(e) => onChange({ work_rights_label: e.target.value || null })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
