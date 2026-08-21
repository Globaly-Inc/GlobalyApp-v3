"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirmation gate for destructive actions. Extracted rows can't be recovered,
 * so every delete in this feature goes through it.
 *
 * const { confirm, dialog } = useConfirmDelete();
 * if (!(await confirm("Delete branch?"))) return;
 * ... render {dialog} once in the tab.
 */
type ConfirmOptions = { confirmLabel?: string; variant?: "destructive" | "default" };

export function useConfirmDelete() {
  const [state, setState] = useState<{ open: boolean; title: string; description?: string } & ConfirmOptions>({
    open: false,
    title: "",
  });
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (title: string, description?: string, options?: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setState({ open: true, title, description, ...options });
      }),
    [],
  );

  const settle = (ok: boolean) => {
    setState((s) => ({ ...s, open: false }));
    resolveRef.current?.(ok);
    resolveRef.current = null;
  };

  const dialog = (
    <Dialog open={state.open} onOpenChange={(open) => !open && settle(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{state.title}</DialogTitle>
          <DialogDescription>
            {state.description ?? "This permanently removes the extracted data. This cannot be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => settle(false)}>
            Cancel
          </Button>
          <Button variant={state.variant ?? "destructive"} className="cursor-pointer" onClick={() => settle(true)}>
            {state.confirmLabel ?? "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, dialog };
}
