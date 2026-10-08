"use client";

import { AlignLeft } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function CreateBranchCopyStep({
  parent,
  copyDescription,
  onCopyDescriptionChange,
}: Readonly<{
  parent: { logo_url: string | null; business_name: string } | undefined;
  copyDescription: boolean;
  onCopyDescriptionChange: (value: boolean) => void;
}>) {
  return (
    <>
      <p className="text-sm text-muted-foreground">Optionally copy branding from the parent business. You can change it on the branch later.</p>
      <div className="flex items-center gap-3 rounded-xl border-[1.5px] p-3.5">
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary text-xs font-semibold uppercase text-primary-foreground">
          {parent?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={parent.logo_url} alt="" className="h-full w-full bg-background object-contain p-1" />
          ) : (
            parent?.business_name.slice(0, 2)
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{parent?.business_name}</p>
          <p className="text-xs text-muted-foreground">Head office</p>
        </div>
      </div>
      <label
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-xl border-[1.5px] p-3.5 transition-colors",
          copyDescription ? "border-primary bg-primary/5" : "hover:border-primary/40",
        )}
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
          <AlignLeft className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Description</p>
          <p className="text-xs text-muted-foreground">Start from the head office&apos;s About text</p>
        </div>
        <Switch checked={copyDescription} onCheckedChange={onCopyDescriptionChange} />
      </label>
    </>
  );
}
