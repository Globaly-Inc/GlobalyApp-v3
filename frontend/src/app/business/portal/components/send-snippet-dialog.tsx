"use client";

import { useId, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/field-error";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { sendEmbedSnippet } from "@/app/business/ai-widget/store/ai-widget-slice";
import { parseEmails } from "../utils";

/** Matches the backend cap on `SendSnippetSchema.emails` — over it the request 400s. */
const MAX_RECIPIENTS = 10;

/** The body, mounted only while open so it starts empty every time rather than re-offering the
 *  last send's recipients. */
function Body({ onClose }: Readonly<{ onClose: () => void }>) {
  const dispatch = useAppDispatch();
  const sending = useAppSelector((s) => s.aiWidget.sendStatus) === "loading";
  const fieldId = useId();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | undefined>();

  const { valid, invalid } = parseEmails(raw);

  const send = async () => {
    if (invalid.length) return setError(`Not an email address: ${invalid.join(", ")}`);
    if (!valid.length) return setError("Enter at least one email address.");
    if (valid.length > MAX_RECIPIENTS) return setError(`That's ${valid.length} addresses — ${MAX_RECIPIENTS} at a time.`);
    try {
      const result = await dispatch(sendEmbedSnippet({ emails: valid })).unwrap();
      toast.success(valid.length > 1 ? `Code sent to ${valid.length} people` : "Code sent", {
        description: `We emailed the code to ${result.sent_to}.`,
      });
      onClose();
    } catch (e) {
      toast.error("Couldn't send the code", { description: typeof e === "string" ? e : "Please try again." });
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Send the code to anyone</DialogTitle>
        <DialogDescription>
          They get the script tag and instructions for where it goes. Nobody is added to your team and
          no account is created — it&apos;s just the code.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId} className="text-xs font-medium text-muted-foreground">
          Email addresses
        </Label>
        <Textarea
          id={fieldId}
          autoFocus
          rows={3}
          value={raw}
          onChange={(e) => { setRaw(e.target.value); setError(undefined); }}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          placeholder="dev@yoursite.com, agency@example.com"
          className="font-mono text-sm"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Separate them with commas, spaces or new lines. Up to {MAX_RECIPIENTS}.
          </p>
          {valid.length > 0 && (
            <p className="shrink-0 text-xs text-muted-foreground">
              {valid.length} address{valid.length === 1 ? "" : "es"}
            </p>
          )}
        </div>
        <FieldError id={`${fieldId}-error`} message={error} />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={sending} className="cursor-pointer">
          Cancel
        </Button>
        <Button onClick={send} disabled={sending || !raw.trim()} className="cursor-pointer">
          <Send className="mr-1.5 h-4 w-4" aria-hidden />
          {sending ? "Sending…" : "Send the code"}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Mail the widget code to addresses the owner types — their agency, a contractor, a colleague.
 * Adds nobody to the team and creates no account, which is the whole difference between this and
 * the invite form it sits next to.
 */
export function SendSnippetDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <Body onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
