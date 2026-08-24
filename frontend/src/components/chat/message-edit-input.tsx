"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Inline editor replacing a message's body — GlobalyOS V2's `EditMessageInput`: a
 * textarea seeded with the current text, Enter to save, Escape to cancel, and explicit
 * Cancel/Save buttons underneath.
 *
 * An emptied body is refused rather than silently deleting the message; the overflow
 * menu's Delete is the way to remove one, and the API enforces the same rule.
 */
export function MessageEditInput({
  initialBody,
  saving,
  onSave,
  onCancel,
}: Readonly<{
  initialBody: string;
  saving: boolean;
  onSave: (body: string) => void;
  onCancel: () => void;
}>) {
  const [value, setValue] = useState(initialBody);
  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && trimmed !== initialBody.trim() && !saving;

  return (
    <div className="mt-1 flex flex-col gap-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (canSave) onSave(trimmed);
          }
          if (e.key === "Escape") onCancel();
        }}
        className="min-h-16 resize-none text-sm [field-sizing:content]"
        disabled={saving}
        autoFocus
      />
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => canSave && onSave(trimmed)} disabled={!canSave}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <span className="text-[11px] text-muted-foreground">Enter to save · Esc to cancel</span>
      </div>
    </div>
  );
}
