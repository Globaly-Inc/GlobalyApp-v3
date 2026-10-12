"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, Plus, ShieldCheck, User as UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrgSwitcherItems, toSwitcherOrgs, useBranchGroups } from "@/app/business/components/org-switcher-items";
import { useAppDispatch } from "@/lib/hooks";
import { switchAccount } from "@/app/auth/store/auth-slice";
import { saveSelectedOrgId } from "@/lib/session";
import type { AuthMeBusiness, AuthMeInstitution } from "@/app/auth/apis";
import { PERSONAL_PORTAL_HOME, SHOW_PERSONAL_PORTAL } from "@/app/personal/const";

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
  // Same rows as the business portal's switcher: branches fold under their head office.
  const groups = useBranchGroups(toSwitcherOrgs(businesses, institutions), activeOrgId);

  // Full reload, matching business-shell's own switch rationale — every slice needs a clean
  // re-fetch under the newly entered tenant context.
  const handleSwitch = async (orgId: string) => {
    saveSelectedOrgId(orgId);
    await dispatch(switchAccount(orgId));
    window.location.assign("/business/portal");
  };

  return (
    <DropdownMenu onOpenChange={groups.onOpenChange}>
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
      <DropdownMenuContent align="start" className="w-64">
        {SHOW_PERSONAL_PORTAL && (
          <>
            <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => router.push(PERSONAL_PORTAL_HOME)}>
              <UserIcon className="h-4 w-4" /> Personal Portal
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <div className="px-2 py-1.5">
          <p className="text-xs font-medium text-muted-foreground">Organizations</p>
        </div>
        <OrgSwitcherItems groups={groups} activeOrgId={activeOrgId} onSwitch={handleSwitch} />
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
