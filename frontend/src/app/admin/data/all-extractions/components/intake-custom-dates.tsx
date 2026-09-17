"use client";

import { useState } from "react";
import { CalendarPlus, Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { IntakeCustomDate } from "../apis/types";
import { formatPartialDate } from "../utils";
import { PartialDateInput } from "./partial-date-input";

/**
 * The row currently open in the editor. `index` is the position in the saved list, or null while
 * adding a new one — which is also what decides whether committing replaces a row or appends.
 */
type Draft = { index: number | null; name: string; date: string };

/** The icon tile every field on this card carries, so a custom date reads as one of them. */
function DateIcon() {
  return (
    <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
      <CalendarPlus className="h-3.5 w-3.5" />
    </div>
  );
}

function DateEditor({
  draft,
  saving,
  onChange,
  onCommit,
  onCancel,
}: Readonly<{
  draft: Draft;
  saving: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onCommit: () => void;
  onCancel: () => void;
}>) {
  // Both halves required: a name with no date states nothing, and a date with no name renders
  // unlabelled everywhere it appears.
  const complete = Boolean(draft.name.trim() && draft.date);

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && complete) onCommit();
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="flex items-end gap-2.5 rounded-lg border border-border bg-muted/20 p-2 md:col-span-2">
      <DateIcon />
      {/* Both inputs `flex-1` (basis 0), so the name and the date split the row evenly however
          wide the card is — the date field was previously pinned to a fixed width and read as an
          afterthought beside a name field that took everything left over.
          
          Aligned on their BOTTOM edge, not centred: the date side carries a Full date / Month
          selector stacked above its input, so it is taller than the name field. Centring left the
          name box floating between the selector and the input, lined up with neither. */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end">
        <Input
          autoFocus
          value={draft.name}
          disabled={saving}
          onChange={(e) => onChange({ name: e.target.value })}
          onKeyDown={keys}
          placeholder="Date name — e.g. Exam Date"
          className="h-9 w-full flex-1 sm:w-auto"
        />
        {/* Same Full date / Month choice as the four fixed fields — a scholarship deadline is
            routinely published as a month only, and picking a day for it invents one. */}
        <PartialDateInput
          value={draft.date}
          disabled={saving}
          onChange={(date) => onChange({ date })}
          className="w-full flex-1 sm:w-auto"
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost" size="icon-sm" className="cursor-pointer text-primary"
          title={complete ? "Save date" : "Enter both a name and a date"}
          disabled={saving || !complete} onClick={onCommit}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant="ghost" size="icon-sm" className="cursor-pointer"
          title="Cancel" disabled={saving} onClick={onCancel}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/**
 * An intake's admin-authored dates — exam dates, scholarship deadlines, document submission —
 * independent of start/end/orientation/admission_deadline.
 *
 * Deliberately built from the same pieces as the fixed fields above it on the card (Field +
 * EditableField): the same bordered box and icon tile, the name as the small muted label with the
 * date as its value, a pencil on hover, and the same two-column grid — so a custom date is
 * indistinguishable from a built-in one. The pencil opens both halves for editing, which is the
 * one thing EditableField itself cannot do (it edits a single value, and here the label is data).
 *
 * The whole list is written back on every change, because it is one `custom_dates` jsonb column
 * rather than rows of their own; the caller's field saver already serialises an array.
 *
 * The section renders only once there is something to show, so an intake with no custom dates is
 * no taller than before — only the "Add Date" button is always present, at the foot on the right.
 */
export function IntakeCustomDates({
  dates,
  onSave,
}: Readonly<{
  dates: IntakeCustomDate[];
  onSave: (next: IntakeCustomDate[]) => Promise<unknown>;
}>) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const commit = async (next: IntakeCustomDate[]) => {
    setSaving(true);
    try {
      // The shared field saver owns its own error toast and reports `false` rather than throwing.
      // Closing the editor regardless would discard the typed row while the column still held the
      // old value — a failed save that looked like a successful one.
      if ((await onSave(next)) !== false) setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  const commitDraft = () => {
    if (!draft) return;
    const row = { name: draft.name.trim(), date: draft.date };
    if (!row.name || !row.date) return;
    commit(draft.index == null ? [...dates, row] : dates.map((d, i) => (i === draft.index ? row : d)));
  };

  // A function, not a stored element: it must only be built where `draft` is known to exist.
  const renderEditor = (open: Draft) => (
    <DateEditor
      draft={open}
      saving={saving}
      onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
      onCommit={commitDraft}
      onCancel={() => setDraft(null)}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      {(dates.length > 0 || draft) && (
        <>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Custom dates</p>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {dates.map((entry, index) =>
              draft && draft.index === index ? (
                <div key={index} className="md:col-span-2">{renderEditor(draft)}</div>
              ) : (
                <div
                  key={index}
                  className="group/date flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-2"
                >
                  <DateIcon />
                  <button
                    type="button"
                    title="Edit this date"
                    disabled={saving || Boolean(draft)}
                    onClick={() => setDraft({ index, name: entry.name, date: entry.date })}
                    className="group/field min-w-0 flex-1 rounded-md p-1 text-left transition-colors cursor-pointer hover:bg-muted/60"
                  >
                    <p className="truncate text-xs text-muted-foreground">{entry.name}</p>
                    <span className="mt-0.5 flex items-start justify-between gap-2">
                      {/* Rendered from the string, never through Date(): reparsing as UTC lands
                          a day off, and a month-only value would gain a 1st it never had. */}
                      <span className="text-sm">{formatPartialDate(entry.date) ?? entry.date}</span>
                      <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/field:opacity-100" />
                    </span>
                  </button>
                  <Button
                    variant="ghost" size="icon-sm"
                    className="mt-1 shrink-0 cursor-pointer text-destructive opacity-0 transition-opacity hover:text-destructive group-hover/date:opacity-100"
                    title="Remove date" disabled={saving || Boolean(draft)}
                    onClick={() => commit(dates.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ),
            )}

            {draft && draft.index == null && renderEditor(draft)}
          </div>
        </>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-fit gap-1.5 self-end px-2 text-xs text-primary hover:text-primary cursor-pointer"
        title="Add a custom date — exam date, scholarship deadline, document submission…"
        disabled={saving || Boolean(draft)}
        onClick={() => setDraft({ index: null, name: "", date: "" })}
      >
        <Plus className="h-3 w-3" />
        Add Date
      </Button>
    </div>
  );
}
