"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";

type SocialField = { label: string; placeholder: string; value: string; onChange: (value: string) => void; error?: string };

export function SocialMediaCard({ fields }: Readonly<{ fields: SocialField[] }>) {
  return (
    <Card className="space-y-4 p-6">
      <h3 className="text-sm font-semibold text-foreground">Social Media</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.label} className="flex flex-col gap-2">
            <Label>{f.label}</Label>
            <Input className="h-10" aria-invalid={!!f.error} value={f.value} onChange={(e) => f.onChange(e.target.value)} placeholder={f.placeholder} />
            <FieldError message={f.error} />
          </div>
        ))}
      </div>
    </Card>
  );
}
