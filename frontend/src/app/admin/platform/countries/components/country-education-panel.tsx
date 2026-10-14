"use client";

import { FormSection } from "@/components/ui/form-section";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { CountryPanelProps } from "../types";

export function CountryEducationPanel({ country, onChange }: CountryPanelProps) {
  return (
    <FormSection title="Education" description="Study costs and headline numbers for students." columns={3}>
        <FormField label="Avg. tuition min" htmlFor="edu-tuition-min">
          <Input
            className="h-10"
            id="edu-tuition-min"
            type="number"
            value={country.avg_tuition_min ?? ""}
            onChange={(e) => onChange({ avg_tuition_min: e.target.value ? Number(e.target.value) : null })}
          />
        </FormField>

        <FormField label="Avg. tuition max" htmlFor="edu-tuition-max">
          <Input
            className="h-10"
            id="edu-tuition-max"
            type="number"
            value={country.avg_tuition_max ?? ""}
            onChange={(e) => onChange({ avg_tuition_max: e.target.value ? Number(e.target.value) : null })}
          />
        </FormField>

        <FormField label="Tuition currency" htmlFor="edu-tuition-currency">
          <Input
            className="h-10"
            id="edu-tuition-currency"
            value={country.avg_tuition_currency ?? ""}
            onChange={(e) => onChange({ avg_tuition_currency: e.target.value || null })}
          />
        </FormField>

        <FormField label="Student count label" htmlFor="edu-student-count">
          <Input
            className="h-10"
            id="edu-student-count"
            value={country.student_count_label ?? ""}
            onChange={(e) => onChange({ student_count_label: e.target.value || null })}
          />
        </FormField>

        <FormField label="Universities count label" htmlFor="edu-universities-count">
          <Input
            className="h-10"
            id="edu-universities-count"
            value={country.universities_count_label ?? ""}
            onChange={(e) => onChange({ universities_count_label: e.target.value || null })}
          />
        </FormField>

        <FormField label="Cost of living label" htmlFor="edu-cost-of-living">
          <Input
            className="h-10"
            id="edu-cost-of-living"
            value={country.cost_of_living_label ?? ""}
            onChange={(e) => onChange({ cost_of_living_label: e.target.value || null })}
          />
        </FormField>

        <FormField label="Work rights label" htmlFor="edu-work-rights">
          <Input
            className="h-10"
            id="edu-work-rights"
            value={country.work_rights_label ?? ""}
            onChange={(e) => onChange({ work_rights_label: e.target.value || null })}
          />
        </FormField>
    </FormSection>
  );
}
