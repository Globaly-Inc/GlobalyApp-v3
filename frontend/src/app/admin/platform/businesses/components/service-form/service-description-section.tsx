"use client";

import { FileText, Loader2, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Textarea } from "@/components/ui/textarea";
import { PublicBadge } from "../services/service-summary-extras";

/** Description card: inline editor on create, pencil-to-edit with its own Save once the service exists. */
export function ServiceDescriptionSection({
  isEdit, description, onChange, editing, onEditingChange, generating, onWriteWithAi, saving, onSave,
}: Readonly<{
  isEdit: boolean;
  description: string;
  onChange: (value: string) => void;
  editing: boolean;
  onEditingChange: (next: boolean | ((v: boolean) => boolean)) => void;
  generating: boolean;
  onWriteWithAi: () => void;
  saving: boolean;
  onSave: () => void;
}>) {
  return (
    <FormSection
      title={<><FileText /> Description <PublicBadge /></>}
      columns={1}
      action={isEdit && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditingChange((v) => !v)} aria-label="Edit description">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
    >
      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="gap-1.5 text-primary" disabled={generating} onClick={onWriteWithAi}>
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Write with AI
            </Button>
          </div>
          <Textarea
            aria-label="Description"
            value={description}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Describe the service..."
            rows={8}
            className="min-h-20"
          />
          {isEdit && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={saving} onClick={() => onEditingChange(false)}>Cancel</Button>
              <Button size="sm" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          )}
        </div>
      ) : description ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{description}</p>
      ) : (
        <div>
          <p className="text-xs text-muted-foreground">Description</p>
          <p className="text-sm italic text-muted-foreground">Not set</p>
        </div>
      )}
    </FormSection>
  );
}
