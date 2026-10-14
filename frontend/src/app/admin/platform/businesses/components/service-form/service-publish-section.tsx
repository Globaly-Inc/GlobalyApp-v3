"use client";

import { Eye } from "lucide-react";
import { FormSection } from "@/components/ui/form-section";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function ServicePublishSection({ isPublished, publishing, onToggle }: Readonly<{ isPublished: boolean; publishing: boolean; onToggle: (next: boolean) => void }>) {
  return (
    <FormSection title={<><Eye /> Visibility</>} description="Saved as soon as you switch it." columns={1}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="service-published">{isPublished ? "Published" : "Unpublished"}</Label>
        <Switch id="service-published" checked={isPublished} disabled={publishing} onCheckedChange={onToggle} />
      </div>
    </FormSection>
  );
}
