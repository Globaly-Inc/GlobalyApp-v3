"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { DynamicIcon } from "@/components/dynamic-icon";
import { Input } from "@/components/ui/input";
import type { Category } from "@/app/admin/platform/categories/apis/types";
import { ServiceCoverBanner } from "./service-cover-banner";

/** The service editor's hero: cover banner, owner logo, category pill and the service name. */
export function ServiceEditorHeader({
  ownerName,
  ownerLogoUrl,
  ownerCoverUrl,
  isInstitution,
  serviceId,
  orgBase,
  coverUrl,
  onCoverChange,
  serviceCategories,
  categoryId,
  onCategoryChange,
  name,
  onNameChange,
}: Readonly<{
  ownerName: string;
  ownerLogoUrl: string | null;
  ownerCoverUrl: string | null;
  isInstitution: boolean;
  /** Null on the create form — a cover needs a saved service to attach to. */
  serviceId: string | null;
  orgBase: string;
  coverUrl: string | null;
  onCoverChange: (coverUrl: string | null) => void;
  serviceCategories: Category[];
  categoryId: number | null;
  onCategoryChange: (id: number | null) => void;
  name: string;
  onNameChange: (name: string) => void;
}>) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <ServiceCoverBanner
        serviceId={serviceId}
        orgBase={orgBase}
        coverUrl={coverUrl}
        fallbackCoverUrl={ownerCoverUrl}
        onCoverChange={onCoverChange}
        fallbackLabel={isInstitution ? "institution" : "business"}
      />
      <CardContent>
        <div className="-mt-14 ml-8 flex items-start gap-4">
          <Avatar className="size-28 shrink-0 rounded-xl border-4 border-background shadow-sm">
            {ownerLogoUrl && <AvatarImage src={ownerLogoUrl} alt={ownerName} className="rounded-lg object-contain p-1" />}
            <AvatarFallback className="rounded-lg bg-background text-xl font-bold text-primary">
              {ownerName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="m-2 flex flex-1 flex-col gap-1.5 pt-4 sm:pt-14">
            <Combobox
              options={serviceCategories.map((c) => ({
                value: String(c.id),
                label: c.name,
                icon: <DynamicIcon name={c.icon} fallback="GraduationCap" className="h-3.5 w-3.5" />,
              }))}
              value={categoryId ? String(categoryId) : ""}
              onChange={(v) => onCategoryChange(v ? Number(v) : null)}
              placeholder="Select category"
              searchPlaceholder="Search categories..."
              className="h-7 w-fit min-w-0 rounded-full border-primary/30 bg-primary/5 px-3 text-xs font-medium text-primary"
              // The trigger is a w-fit pill, and the popup defaults to the trigger's width —
              // which truncates every category name. Give the list its own width instead.
              contentClassName="w-64"
            />
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Untitled service"
              className="h-10 border-none p-0 text-xl font-bold text-foreground shadow-none focus-visible:ring-0"
            />
            <p className="text-sm text-muted-foreground">{ownerName}</p>
          </div>
        </div>
      </CardContent>
    </div>
  );
}
