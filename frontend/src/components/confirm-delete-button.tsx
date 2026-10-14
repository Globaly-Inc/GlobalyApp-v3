"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Trash icon that turns into an inline "Delete? Cancel / Delete" before calling `onConfirm`,
 * so a stray click can't remove a row. Stays in "confirming" with a spinner while it runs. */
export function ConfirmDeleteButton({
  onConfirm,
  label = "Delete",
  question = "Delete?",
}: Readonly<{ onConfirm: () => Promise<void> | void; label?: string; question?: string }>) {
  const [state, setState] = useState<"idle" | "confirming" | "deleting">("idle");

  if (state === "idle") {
    return (
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive active:scale-90"
        onClick={() => setState("confirming")}
        aria-label={label}
        title={label}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    );
  }
  return (
    <span className="animate-pop-in flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-destructive">
      {question}
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={state === "deleting"} onClick={() => setState("idle")} autoFocus>
        Cancel
      </Button>
      <Button
        size="sm"
        variant="destructive"
        className="h-7 px-2 text-xs"
        disabled={state === "deleting"}
        onClick={async () => {
          setState("deleting");
          try {
            await onConfirm();
          } finally {
            // The row usually unmounts on success; if it didn't (error), go back to the icon.
            setState("idle");
          }
        }}
      >
        {state === "deleting" && <Loader2 className="h-3 w-3 animate-spin" />}
        {label}
      </Button>
    </span>
  );
}
