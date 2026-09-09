"use client";

import { useCallback, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { changedFields, datePrecisionOf, formatPartialDate, toDateInputValue, type DatePrecision } from "../utils";
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
 *
 * Reports the request's outcome rather than throwing — it owns the failure toast, and callers are
 * click handlers with nowhere to catch. **Returns false when nothing was persisted**, which every
 * editor must honour: swallowing the error and resolving anyway made a failed save look like a
 * successful one, closing the editor and discarding what the reviewer had typed while the row was
 * unchanged. Keep the editor open on false.
 */
export function useFieldSaver(jobId: string, reload: () => Promise<unknown> | void) {
  return useCallback(
    // `next` also takes an array, for the jsonb columns a tab edits as a whole list
    // (extraction_intakes.custom_dates). patchEntityRow serialises it server-side.
    async (table: EditableTable, id: string, column: string, next: string | null | unknown[]): Promise<boolean> => {
      try {
        await allExtractionsApi.saveAndLearn({ table, id, patch: { [column]: next }, job_id: jobId });
        toast.success("Saved");
        await reload();
        return true;
      } catch (e) {
        toast.error("Save failed", { description: (e as Error).message });
        return false;
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
  type?: string;
  className?: string;
  placeholder?: string;
  /**
   * Turns this into an intake-style date field: a Full date / Month selector beside the input,
   * committing "YYYY-MM-DD" or "YYYY-MM" accordingly, and displaying the value at the precision
   * it was stated ("September 2026", not "1 September 2026").
   *
   * Universities publish both — an exact term start, a month-only application deadline — and
   * picking a day for them invents a deadline. Lives here rather than in a separate component so
   * there stays exactly one inline editor to maintain.
   */
  datePrecision?: boolean;
}>;

export function EditableField({
  label,
  value,
  onSave,
  multiline = false,
  type = "text",
  className,
  placeholder = "—",
  datePrecision = false,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  // Defaults to whatever the stored value already is, so opening a month-only field and saving
  // without touching the selector cannot silently promote it to a full date.
  const [precision, setPrecision] = useState<DatePrecision>(() => datePrecisionOf(value) ?? "full_date");

  const start = () => {
    const current = datePrecisionOf(value) ?? "full_date";
    setPrecision(current);
    setDraft(datePrecision ? toDateInputValue(value, current) : value ?? "");
    setEditing(true);
  };

  /** Switching precision reshapes what is already typed rather than clearing it. */
  const switchPrecision = (next: DatePrecision) => {
    setPrecision(next);
    setDraft((d) => (next === "month" ? d.slice(0, 7) : d.length === 7 ? "" : d));
  };

  const commit = async () => {
    const next = draft.trim() || null;
    if (next === (value ?? null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      // Only an explicit `false` means the save failed — keep the field open so the edit isn't
      // lost. Savers that report nothing are treated as successful, as they always were.
      if ((await onSave(next)) !== false) setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    const InputEl = multiline ? Textarea : Input;
    return (
      <div className={className}>
        <p className="text-xs text-muted-foreground">{label}</p>
        {datePrecision && (
          <div className="mt-1 inline-flex overflow-hidden rounded-md border border-border">
            {(["full_date", "month"] as const).map((p) => (
              <button
                key={p}
                type="button"
                disabled={saving}
                onClick={() => switchPrecision(p)}
                className={cn(
                  "cursor-pointer px-2 py-0.5 text-[11px] transition-colors",
                  precision === p ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {p === "full_date" ? "Full date" : "Month"}
              </button>
            ))}
          </div>
        )}
        <div className="mt-0.5 flex items-start gap-1">
          <InputEl
            autoFocus
            type={multiline ? undefined : datePrecision ? (precision === "month" ? "month" : "date") : type}
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
        <span className={cn("text-sm break-words", !value && "text-muted-foreground")}>
          {(datePrecision ? formatPartialDate(value) : value) || placeholder}
        </span>
        <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/field:opacity-100" />
      </span>
    </button>
  );
}
