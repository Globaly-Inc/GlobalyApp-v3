"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BranchFormFooter({
  step,
  stepCount,
  saving,
  isEdit,
  onBack,
  onNext,
  onSubmit,
}: Readonly<{
  step: number;
  stepCount: number;
  saving: boolean;
  isEdit: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}>) {
  const last = step === stepCount - 1;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4">
      <span className="text-xs tabular-nums text-muted-foreground">Step {step + 1} of {stepCount}</span>
      <div className="ml-auto flex gap-2">
        {step > 0 && (
          <Button variant="outline" onClick={onBack} disabled={saving}>
            Back
          </Button>
        )}
        {last ? (
          <Button className="min-w-32 transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-[0_6px_18px_-6px_var(--color-primary)]" onClick={onSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create branch"}
          </Button>
        ) : (
          <Button className="group/next min-w-32 transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-[0_6px_18px_-6px_var(--color-primary)]" onClick={onNext}>
            Next <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover/next:translate-x-0.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
