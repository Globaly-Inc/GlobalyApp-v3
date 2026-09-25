"use client";

import { z } from "zod";
import { useState } from "react";
import { Loader2, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Accreditation } from "../apis/types";

const accreditationSchema = z.object({
  name: z.string().trim().min(1, "Accreditation name is required"),
  issuingOrganization: z.string().trim().transform((v) => v || null),
});

export function AccreditationForm({
  accreditation,
  saving,
  onCancel,
  onSave,
}: Readonly<{
  accreditation?: Accreditation;
  saving: boolean;
  onCancel: () => void;
  onSave: (values: { name: string; issuing_organization: string | null }) => void;
}>) {
  const [name, setName] = useState(accreditation?.name ?? "");
  const [issuingOrganization, setIssuingOrganization] = useState(accreditation?.issuing_organization ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    const result = accreditationSchema.safeParse({ name, issuingOrganization });
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
    onSave({ name: d.name, issuing_organization: d.issuingOrganization });
  };

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {accreditation ? "Edit Accreditation" : "Add Accreditation"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accreditation-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="accreditation-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
            }}
            placeholder="e.g. AACSB Accreditation"
            aria-invalid={Boolean(errors.name)}
          />
          <FieldError message={errors.name} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accreditation-issuer">Issuing Organization</Label>
          <Input
            id="accreditation-issuer"
            value={issuingOrganization}
            onChange={(e) => setIssuingOrganization(e.target.value)}
            placeholder="e.g. Association to Advance Collegiate Schools of Business"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="cursor-pointer" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button className="gap-1.5 cursor-pointer" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {accreditation ? "Save" : "Add"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
