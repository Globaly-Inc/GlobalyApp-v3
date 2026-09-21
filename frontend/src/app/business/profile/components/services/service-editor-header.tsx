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
        {/* The negative margin hangs off the avatar, not the row: lifting the row lifted the text
            column with it, and its 16px of top padding was nowhere near the 56px needed to put it
            back, so on phones the category pill and name sat on top of the cover. This way the
            overlap is the logo's alone, whatever the text column's height. */}
        <div className="ml-8 flex items-start gap-4">
          <Avatar className="-mt-14 size-28 shrink-0 rounded-xl border-4 border-background shadow-sm">
            {ownerLogoUrl && <AvatarImage src={ownerLogoUrl} alt={ownerName} className="rounded-lg object-contain p-1" />}
            <AvatarFallback className="rounded-lg bg-background text-xl font-bold text-primary">
              {ownerName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
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
            {/* h-auto, not h-10: a 40px box around 20px text left ~7px of dead space under the
                name, which read as a gap between it and the owner line below.
                `md:text-xl` as well as `text-xl` because Input's base carries `md:text-sm` — a
                separate variant, so it survives the class merge and wins back at md and up. */}
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Untitled service"
              className="h-auto border-none p-0 text-xl leading-tight font-bold text-foreground shadow-none focus-visible:ring-0 md:text-xl"
            />
            <p className="truncate text-sm leading-tight text-muted-foreground">{ownerName}</p>
          </div>
        </div>
      </CardContent>
    </div>
  );
}
