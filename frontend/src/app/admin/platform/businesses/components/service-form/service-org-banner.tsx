"use client";

import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";

/** The owning business/institution: cover image, logo and name, as a compact card above the form. */
export function ServiceOrgBanner({
  coverUrl, logoUrl, name, extras,
}: Readonly<{ coverUrl?: string | null; logoUrl?: string | null; name: string; extras?: ReactNode }>) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="relative h-24 bg-gradient-to-br from-primary/15 to-primary/5 sm:h-28">
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <Avatar className="-mt-10 size-16 rounded-xl border-4 border-background bg-card shadow-sm">
          {logoUrl && <AvatarImage src={logoUrl} alt={name} className="rounded-lg object-contain p-1" />}
          <AvatarFallback className="rounded-lg bg-primary text-xl font-medium text-primary-foreground">
            {name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <p className="min-w-0 truncate text-sm font-medium">{name}</p>
        {extras}
      </div>
    </Card>
  );
}
