"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { refreshAccessToken } from "@/lib/api/http";
import { PERSONAL_PORTAL_HOME, SHOW_PERSONAL_PORTAL } from "@/app/personal/const";

export type PortalAccount = {
  name: string;
  email?: string | null;
  photoUrl?: string | null;
  isAdmin: boolean;
};

const ITEM = "cursor-pointer px-1.5 py-1.5";

function AccountAvatar({ account, className }: Readonly<{ account: PortalAccount; className: string }>) {
  const initial = (account.name || account.email || "U").charAt(0).toUpperCase();
  return (
    <Avatar className={className}>
      {account.photoUrl && <AvatarImage src={account.photoUrl} alt="" />}
      <AvatarFallback>{initial}</AvatarFallback>
    </Avatar>
  );
}

/** The avatar menu every portal shares: who you are, the portals you can switch to, sign out. */
export function PortalAccountMenu({ account, onSignOut }: Readonly<{ account: PortalAccount; onSignOut: () => void }>) {
  const router = useRouter();

  // A business-scoped token carries no admin claim, so refresh before entering the admin portal.
  const goToAdmin = async () => {
    await refreshAccessToken();
    window.location.assign("/admin/overview");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Account menu"
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border py-1 pl-1 pr-2 hover:bg-muted"
          />
        }
      >
        <AccountAvatar account={account} className="size-7" />
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-1.5">
        <DropdownMenuItem className={`${ITEM} flex items-center gap-2`} onClick={() => router.push("/personal/profile")}>
          <AccountAvatar account={account} className="size-8 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{account.name || "User"}</p>
            {account.email && <p className="truncate text-xs text-muted-foreground">{account.email}</p>}
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {SHOW_PERSONAL_PORTAL && (
          <DropdownMenuItem className={ITEM} onClick={() => router.push(PERSONAL_PORTAL_HOME)}>
            Personal Portal
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className={ITEM} onClick={() => router.push("/business/portal")}>
          Business Portal
        </DropdownMenuItem>
        {account.isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className={ITEM} onClick={goToAdmin}>
              Super Admin
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className={ITEM} variant="destructive" onClick={onSignOut}>
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
