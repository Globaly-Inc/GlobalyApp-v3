"use client";

import { useState } from "react";
import { DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function PriceEditPopover({
  price,
  onSave,
}: Readonly<{ price: string | null; onSave: (next: number) => Promise<void> }>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(price ?? "");
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(price ?? "");
    setOpen(next);
  };

  const handleSave = async () => {
    const next = Number(draft);
    if (!Number.isFinite(next) || next < 0) return;
    setSaving(true);
    await onSave(next);
    setSaving(false);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button size="icon-sm" variant="ghost" aria-label="Edit price">
            <DollarSign className="h-4 w-4" />
          </Button>
        }
      />
      {open && (
        <PopoverContent align="end" className="w-56">
          <div className="flex flex-col gap-2">
            <Label>Price</Label>
            <Input
              type="number"
              min={0}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
