"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EditableNumberField({
  label,
  value,
  onSave,
}: Readonly<{ label: string; value: number; onSave: (next: number) => Promise<void> }>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(String(value));
    setEditing(true);
  };

  const handleSave = async () => {
    const next = Number(draft);
    if (!Number.isFinite(next) || next < 0) return;
    setSaving(true);
    await onSave(next);
    setSaving(false);
    setEditing(false);
  };

  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {editing ? (
        <div className="mt-1 flex items-center gap-1.5">
          <Input
            type="number"
            min={0}
            className="h-8 w-24"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <Button size="icon-sm" variant="ghost" onClick={handleSave} disabled={saving} aria-label="Save">
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="group flex items-center gap-1.5">
          <p className="text-sm font-medium text-foreground">{value}</p>
          <Button size="icon-sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={startEdit} aria-label={`Edit ${label}`}>
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
