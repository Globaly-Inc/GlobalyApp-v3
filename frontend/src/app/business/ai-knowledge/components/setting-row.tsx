"use client";

import { Combobox } from "@/components/combobox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Choice } from "../const";

/**
 * One setting: what it controls on the left, the control on the right.
 *
 * Combobox rather than Select for every picker, per frontend/AGENTS.md — and the wrapper is
 * flex+gap, never space-y, because base-ui's focus guards inflate a space-y parent the moment
 * the popover opens.
 */
export function ChoiceRow({
  label, hint, options, value, onChange, disabled,
}: Readonly<{
  label: string;
  hint?: string;
  options: Choice<string>[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}>) {
  return (
    <div className="flex flex-col gap-2 border-t py-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 sm:max-w-[48%]">
        <Label className="text-sm">{label}</Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="w-full sm:w-72">
        <Combobox options={options} value={value} onChange={onChange} disabled={disabled} />
      </div>
    </div>
  );
}

export function ToggleRow({
  label, hint, checked, onChange, disabled,
}: Readonly<{
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}>) {
  return (
    <div className="flex items-start justify-between gap-6 border-t py-4 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <Label className="text-sm">{label}</Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
