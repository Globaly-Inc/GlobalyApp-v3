"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";

export function MediaUrlsCard({
  logoUrl,
  onLogoUrlChange,
  logoUrlError,
  coverUrl,
  onCoverUrlChange,
  coverUrlError,
}: Readonly<{
  logoUrl: string;
  onLogoUrlChange: (value: string) => void;
  logoUrlError?: string;
  coverUrl: string;
  onCoverUrlChange: (value: string) => void;
  coverUrlError?: string;
}>) {
  return (
    <Card className="space-y-4 p-6">
      <h3 className="text-sm font-semibold text-foreground">Media URLs</h3>
      <div className="flex flex-col gap-2">
        <Label>Logo URL</Label>
        <Input className="h-10" aria-invalid={!!logoUrlError} value={logoUrl} onChange={(e) => onLogoUrlChange(e.target.value)} placeholder="https://..." />
        <FieldError message={logoUrlError} />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Cover Image URL</Label>
        <Input className="h-10" aria-invalid={!!coverUrlError} value={coverUrl} onChange={(e) => onCoverUrlChange(e.target.value)} placeholder="https://..." />
        <FieldError message={coverUrlError} />
      </div>
    </Card>
  );
}
