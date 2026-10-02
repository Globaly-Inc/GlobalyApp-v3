import { Loader2 } from "lucide-react";

/** Shown while the visitor waits for a person. Nothing to press: typing on is fine. */
export function WaitingCard() {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      <div>
        <p className="text-sm font-semibold">Waiting for the admissions team</p>
        <p className="text-xs text-muted-foreground">
          Someone will reply here shortly. You can keep typing in the meantime.
        </p>
      </div>
    </div>
  );
}
