"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/**
 * `const { confirm, dialog } = useConfirmDelete()` — await confirm("…") to gate a
 * destructive action, and render {dialog} once in the component.
 */
export function useConfirmDelete() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((text: string) => {
    setMessage(text);
    setOpen(true);
    return new Promise<boolean>((resolve) => { resolveRef.current = resolve; });
  }, []);

  const settle = (ok: boolean) => {
    setOpen(false);
    resolveRef.current?.(ok);
    resolveRef.current = null;
  };

  const dialog = (
    <Dialog open={open} onOpenChange={(next) => { if (!next) settle(false); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{message}</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => settle(false)}>Cancel</Button>
          <Button variant="destructive" className="cursor-pointer" onClick={() => settle(true)}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, dialog };
}
