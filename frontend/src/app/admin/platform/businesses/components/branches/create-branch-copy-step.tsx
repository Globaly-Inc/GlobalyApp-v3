"use client";

import { Switch } from "@/components/ui/switch";
import type { BusinessDetail } from "../../apis/types";

export function CreateBranchCopyStep({
  parent,
  copyDescription,
  onCopyDescriptionChange,
}: Readonly<{ parent: BusinessDetail | undefined; copyDescription: boolean; onCopyDescriptionChange: (value: boolean) => void }>) {
  return (
    <>
      <p className="text-sm text-muted-foreground">Optionally copy branding from the parent business.</p>
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-xs font-semibold uppercase">
          {parent?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={parent.logo_url} alt="" className="h-full w-full object-contain p-1" />
          ) : (
            parent?.business_name.slice(0, 2)
          )}
        </div>
        <span className="text-sm font-medium">{parent?.business_name}</span>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <span className="text-sm">Description</span>
        <Switch checked={copyDescription} onCheckedChange={onCopyDescriptionChange} />
      </label>
    </>
  );
}
