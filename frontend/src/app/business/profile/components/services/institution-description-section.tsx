"use client";

import { FileText, Loader2, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormSection } from "@/components/ui/form-section";
import { VisibilityToggle } from "./visibility-toggle";
import type { InstitutionServiceForm } from "./use-institution-service-form";

/** Description card of the institution form: read view, or an editor with "Write with AI" (edit mode saves it here). */
export function InstitutionDescriptionSection({ f }: Readonly<{ f: InstitutionServiceForm }>) {
  const { isEdit, form, set, editingDescription, setEditingDescription, savingDescription, generatingDescription } = f;
  let body: React.ReactNode;
  if (editingDescription) {
    body = (
      <div className="animate-row-rise flex flex-col gap-3">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="gap-1.5 text-primary" disabled={generatingDescription} onClick={f.handleWriteWithAi}>
            {generatingDescription ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Write with AI
          </Button>
        </div>
        <Textarea
          aria-label="Description"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Describe the service..."
          rows={8}
          className="min-h-20"
        />
        {isEdit && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={savingDescription} onClick={() => setEditingDescription(false)}>Cancel</Button>
            <Button size="sm" disabled={savingDescription} onClick={f.handleSaveDescription}>{savingDescription ? "Saving…" : "Save"}</Button>
          </div>
        )}
      </div>
    );
  } else if (form.description) {
    body = <p className="whitespace-pre-wrap text-sm leading-relaxed">{form.description}</p>;
  } else {
    body = (
      <div>
        <p className="text-xs text-muted-foreground">Description</p>
        <p className="text-sm italic text-muted-foreground">Not set</p>
      </div>
    );
  }

  return (
    <FormSection
      title={<><FileText /> Description</>}
      columns={1}
      action={
        <div className="flex items-center gap-2">
          <VisibilityToggle section="description" visibility={f.sectionVisibility} />
          {isEdit && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingDescription((v) => !v)} aria-label="Edit description">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      }
    >
      {body}
    </FormSection>
  );
}
