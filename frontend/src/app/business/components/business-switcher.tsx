"use client";

import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AuthMeBusiness } from "@/app/auth/apis";

// Ported from V1's BusinessLayout businessSwitcher: lives inline in the header (not inside the
// account menu), always visible once the user owns at least one business, and always offers a
// way to start another — switching businesses and switching accounts are different actions and
// V1 keeps them in separate menus for exactly that reason.
export function BusinessSwitcher({
  businesses,
  activeOrgId,
  onSwitch,
}: Readonly<{ businesses: AuthMeBusiness[]; activeOrgId: string | null; onSwitch: (orgId: string) => void }>) {
  const router = useRouter();
  const active = businesses.find((b) => b.org_id === activeOrgId) ?? businesses[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm font-semibold hover:bg-muted cursor-pointer"
            type="button"
          />
        }
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted overflow-hidden">
          {active?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={active.logo_url} alt="" className="size-full object-contain p-0.5" />
          ) : (
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
        <span className="max-w-[160px] truncate">{active?.business_name ?? "Business"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          {businesses.map((b) => (
            <DropdownMenuItem key={b.org_id} className="cursor-pointer gap-2" onClick={() => onSwitch(b.org_id)}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sm">{b.business_name}</span>
                <span className="block truncate text-xs text-muted-foreground capitalize">{b.role}</span>
              </span>
              {b.org_id === activeOrgId && <Check className="h-4 w-4 text-primary shrink-0" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/business/onboarding?new=1")}>
          <Plus /> Create New Business
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
