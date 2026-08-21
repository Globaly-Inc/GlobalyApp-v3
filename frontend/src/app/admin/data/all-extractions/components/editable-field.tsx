"use client";

import { useCallback, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { changedFields } from "../utils";
import type { EditableTable } from "../apis/types";

/**
 * Saves an edit form through save-and-learn, sending only the fields that actually changed
 * so the learning loop isn't told about untouched ones. No-ops when nothing changed.
 * Throws on failure — call sites wrap it in their own toast/reload handling.
 */
export async function saveFormAndLearn(
  table: EditableTable,
  original: Record<string, unknown> & { id: string },
  values: Record<string, unknown>,
  jobId: string,
): Promise<void> {
  const patch = changedFields(original, values);
  if (Object.keys(patch).length === 0) return;
  await allExtractionsApi.saveAndLearn({
    table,
    id: original.id,
    patch,
    job_id: jobId,
    source_url: typeof original.source_url === "string" ? original.source_url : undefined,
  });
}

/**
 * Saves a single column through save-and-learn, so a reviewer's correction also
 * becomes a lesson for the extractor. Shared by every list tab.
 */
export function useFieldSaver(jobId: string, reload: () => Promise<unknown> | void) {
  return useCallback(
    async (table: EditableTable, id: string, column: string, next: string | null) => {
      try {
        await allExtractionsApi.saveAndLearn({ table, id, patch: { [column]: next }, job_id: jobId });
        toast.success("Saved");
        await reload();
      } catch (e) {
        toast.error("Save failed", { description: (e as Error).message });
      }
    },
    [jobId, reload],
  );
}

/**
 * A labelled value that turns into an input on click. The pencil only appears on
 * hover; ✓ / ✕ (or Enter / Escape) commit or discard.
 */
export type EditableFieldProps = Readonly<{
  label: string;
  value: string | null | undefined;
  onSave: (next: string | null) => Promise<unknown>;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
}>;

export function EditableField({
  label,
  value,
  onSave,
  multiline = false,
  className,
  placeholder = "—",
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  const start = () => {
    setDraft(value ?? "");
    setEditing(true);
  };

  const commit = async () => {
    const next = draft.trim() || null;
    if (next === (value ?? null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    const InputEl = multiline ? Textarea : Input;
    return (
      <div className={className}>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex items-start gap-1">
          <InputEl
            autoFocus
            value={draft}
            disabled={saving}
            onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setDraft(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter" && !multiline) {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            className={cn("h-9 flex-1", multiline && "h-auto")}
          />
          <Button variant="ghost" size="icon-sm" className="cursor-pointer text-primary" title="Save" disabled={saving} onClick={commit}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon-sm" className="cursor-pointer" title="Cancel" disabled={saving} onClick={() => setEditing(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      className={cn(
        "group/field w-full rounded-md p-1 text-left transition-colors cursor-pointer hover:bg-muted/60",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <span className="mt-0.5 flex items-start justify-between gap-2">
        <span className={cn("text-sm break-words", !value && "text-muted-foreground")}>{value || placeholder}</span>
        <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/field:opacity-100" />
      </span>
    </button>
  );
}
