"use client";

import { Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/** Compact cover + logo + org name card at the top of both service forms. */
export function ServiceHeroCard({ coverUrl, logoUrl, orgName }: Readonly<{
  coverUrl?: string | null;
  logoUrl?: string | null;
  orgName: string;
}>) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="relative h-24 overflow-hidden bg-linear-to-br from-primary/20 to-primary/5 sm:h-28">
        {coverUrl && <img src={coverUrl} alt="" className="absolute inset-0 size-full object-cover" /> /* eslint-disable-line @next/next/no-img-element -- signed storage URL */}
        <span aria-hidden className="animate-sheen absolute inset-0 bg-linear-to-r from-transparent via-background/40 to-transparent" />
      </div>
      <div className="flex items-end gap-4 px-5 pb-4">
        <Avatar className="animate-pop-in -mt-8 size-16 shrink-0 rounded-xl border-4 border-background bg-background shadow-sm [animation-delay:200ms] [animation-fill-mode:both]">
          {logoUrl && <AvatarImage src={logoUrl} alt={orgName} className="rounded-lg object-contain p-1" />}
          <AvatarFallback className="rounded-lg bg-primary text-xl font-semibold text-primary-foreground">
            {orgName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-foreground">
          <Building2 className="size-4 shrink-0 text-muted-foreground" /> {orgName}
        </p>
      </div>
    </Card>
  );
}
