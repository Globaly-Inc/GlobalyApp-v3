"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Prompt = {
  title: string;
  description: string;
  /** Label on the confirming button — name the action, not "OK". */
  action: string;
  /** Archiving is reversible, so it should not wear the destructive red. */
  destructive?: boolean;
};

const EMPTY: Prompt = { title: "", description: "", action: "Confirm" };

/**
 * `const { confirm, dialog } = useConfirmAction()` — await confirm({…}) to gate an
 * action, and render {dialog} once in the component.
 *
 * Replaces window.confirm, which the browser renders as a bare chrome alert showing the
 * page origin and ignoring the app's styling entirely. Parameterised because the sidebar
 * gates two different actions: archiving is restorable, deleting is not.
 */
export function useConfirmAction() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<Prompt>(EMPTY);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((next: Prompt) => {
    setPrompt(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => { resolveRef.current = resolve; });
  }, []);

  // Always settle the promise — an unresolved one leaves the caller awaiting forever,
  // so dismissing by Escape or backdrop has to resolve false like Cancel does.
  const settle = (ok: boolean) => {
    setOpen(false);
    resolveRef.current?.(ok);
    resolveRef.current = null;
  };

  const dialog = (
    <Dialog open={open} onOpenChange={(next) => { if (!next) settle(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{prompt.title}</DialogTitle>
          <DialogDescription>{prompt.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => settle(false)}>
            Cancel
          </Button>
          <Button
            variant={prompt.destructive ? "destructive" : "default"}
            className="cursor-pointer"
            onClick={() => settle(true)}
          >
            {prompt.action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, dialog };
}
