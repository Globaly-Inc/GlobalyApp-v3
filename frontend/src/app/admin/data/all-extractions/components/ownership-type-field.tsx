"use client";

import { useState } from "react";
import { Landmark, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
];

const LABEL_OF: Record<string, string> = { public: "Public", private: "Private" };

export type OwnershipTypeFieldProps = Readonly<{
  value: string | null | undefined;
  onSave: (next: string | null) => Promise<unknown>;
  className?: string;
}>;

/** Public/private ownership — a fixed two-option Combobox, same click-to-edit shape as the
 * other Field variants (EditableCountryField) but with a static option list instead of a
 * fetched one. */
export function OwnershipTypeField({ value, onSave, className }: OwnershipTypeFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(value ?? "");
    setEditing(true);
  };

  const commit = async (next: string) => {
    const val = next || null;
    if (val === (value ?? null)) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(val);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-2", className)}>
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Landmark className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Institution Type</p>
            <div className="flex items-center gap-1">
              <Combobox
                options={OPTIONS}
                value={draft}
                onChange={(v) => { setDraft(v); commit(v); }}
                placeholder="Select public or private"
                disabled={saving}
                className="h-9 flex-1"
              />
              <Button
                variant="ghost" size="icon-sm"
                className="shrink-0 cursor-pointer"
                title="Cancel"
                disabled={saving}
                onClick={() => setEditing(false)}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="text-xs">✕</span>}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="group/field w-full cursor-pointer rounded-md p-1 text-left transition-colors hover:bg-muted/60"
          >
            <p className="text-xs text-muted-foreground">Institution Type</p>
            <span className={cn("mt-0.5 block text-sm", !value && "text-muted-foreground")}>
              {(value && LABEL_OF[value]) || "—"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
