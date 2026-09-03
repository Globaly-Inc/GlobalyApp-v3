"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronDown, Plus, ShieldCheck, User as UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppDispatch } from "@/lib/hooks";
import { switchAccount } from "@/app/auth/store/auth-slice";
import { saveSelectedOrgId } from "@/lib/session";
import type { AuthMeBusiness, AuthMeInstitution } from "@/app/auth/apis";

type Org = { org_id: string; name: string; logo_url: string | null };

function toOrgs(businesses: AuthMeBusiness[], institutions: AuthMeInstitution[]): Org[] {
  return [
    ...businesses.map((b) => ({ org_id: b.org_id, name: b.business_name, logo_url: b.logo_url })),
    ...institutions.map((i) => ({ org_id: i.org_id, name: i.institution_name, logo_url: i.logo_url })),
  ];
}

// Ported from V1's AdminLayout portalLabel — the header's "Super Admin ▾" trigger doubles as an
// account/org switcher: personal portal, any businesses or institutions this admin also owns
// (an admin is a platform_user first, so they can), a way to start another, and a pinned
// shortcut back to the admin console for actual super admins.
export function AdminPortalSwitcher({
  roleLabel,
  isSuperAdmin,
  businesses,
  institutions,
  activeOrgId,
}: Readonly<{
  roleLabel: string;
  isSuperAdmin: boolean;
  businesses: AuthMeBusiness[];
  institutions: AuthMeInstitution[];
  activeOrgId: string | null;
}>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const orgs = toOrgs(businesses, institutions);

  // Full reload, matching business-shell's own switch rationale — every slice needs a clean
  // re-fetch under the newly entered tenant context.
  const handleSwitch = async (orgId: string) => {
    saveSelectedOrgId(orgId);
    await dispatch(switchAccount(orgId));
    window.location.assign("/business/portal");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-80 transition-opacity cursor-pointer"
          />
        }
      >
        <ShieldCheck className="h-5 w-5 text-primary" />
        <span>{roleLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => router.push("/personal/portal")}>
          <UserIcon className="h-4 w-4" /> Personal Portal
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <p className="text-xs font-medium text-muted-foreground">Organizations</p>
        </div>
        {orgs.map((org) => (
          <DropdownMenuItem key={org.org_id} className="cursor-pointer gap-2" onClick={() => handleSwitch(org.org_id)}>
            <Avatar className="h-5 w-5 rounded-md">
              {org.logo_url && <AvatarImage src={org.logo_url} alt="" />}
              <AvatarFallback className="rounded-md bg-primary/10 text-primary text-xs font-semibold">
                {org.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 min-w-0 truncate">{org.name}</span>
            {org.org_id === activeOrgId && <Check className="h-4 w-4 text-primary shrink-0" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => router.push("/business/onboarding?new=1")}>
          <Plus className="h-4 w-4" /> Create new business
        </DropdownMenuItem>
        {isSuperAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-amber-600 focus:text-amber-600"
              onClick={() => router.push("/admin/overview")}
            >
              <ShieldCheck className="h-4 w-4" /> Super Admin
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
