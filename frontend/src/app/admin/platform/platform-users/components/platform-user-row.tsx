import { Database, MoreHorizontal, Shield, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchPlatformUsers, setPlatformUserAdminRole } from "../store/platform-users-slice";
import type { ListParams, PlatformUser, PlatformUserAdminRole } from "../apis/types";

export function PlatformUserRow({
  user, refreshParams, onSuspend, onSuperAdminAction,
}: Readonly<{
  user: PlatformUser;
  refreshParams: ListParams;
  onSuspend: () => void;
  onSuperAdminAction: (grant: boolean) => void;
}>) {
  const dispatch = useAppDispatch();
  const { me } = useAppSelector((state) => state.admin);
  const canManage = me?.role === "super_admin";
  const isSelf = me?.platform_user_id === user.id;
  const initial = (user.first_name?.[0] ?? user.email[0] ?? "U").toUpperCase();
  const active = user.account_status !== 0;
  const isSuperAdmin = user.admin_role === "super_admin";
  const isDataAdmin = user.admin_role === "data_admin";

  const applyRole = async (role: PlatformUserAdminRole | null, successMessage: string) => {
    const result = await dispatch(setPlatformUserAdminRole({ id: user.id, role }));
    if (setPlatformUserAdminRole.rejected.match(result)) {
      toast.error("Couldn't update role", { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success(successMessage);
    dispatch(fetchPlatformUsers(refreshParams));
  };

  const isAdmin = isSuperAdmin || isDataAdmin;
  const joined = new Date(user.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="group flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card p-4 transition-colors duration-150 ease-out hover:border-border hover:bg-muted/50">
      <div className="flex min-w-0 items-center gap-3.5">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold uppercase ring-2 ring-offset-2 ring-offset-card",
            isAdmin ? "bg-primary/10 text-primary ring-primary/20" : "bg-muted text-muted-foreground ring-transparent",
          )}
        >
          {initial}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">
              {user.first_name} {user.last_name}
            </span>
            {isSuperAdmin && (
              <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px] font-medium">
                <Shield className="h-3 w-3" /> Super Admin
              </Badge>
            )}
            {isDataAdmin && (
              <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] font-medium">
                <Database className="h-3 w-3" /> Data Admin
              </Badge>
            )}
            {!active && (
              <Badge variant="destructive" className="px-1.5 py-0 text-[10px] font-medium">
                Suspended
              </Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[user.email, user.country, `Joined ${joined}`].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 opacity-80 transition-opacity duration-150 ease-out group-hover:opacity-100">
        <Button
          variant="ghost"
          size="sm"
          className={active ? "text-destructive hover:bg-destructive/10 hover:text-destructive" : "text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600"}
          onClick={onSuspend}
        >
          <ShieldOff className="mr-1 h-3.5 w-3.5" />
          {active ? "Suspend" : "Unsuspend"}
        </Button>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isSuperAdmin ? (
                !isSelf && (
                  <DropdownMenuItem className="text-destructive" onClick={() => onSuperAdminAction(false)}>
                    <Shield className="mr-2 h-4 w-4" /> Remove Super Admin
                  </DropdownMenuItem>
                )
              ) : (
                <DropdownMenuItem onClick={() => onSuperAdminAction(true)}>
                  <Shield className="mr-2 h-4 w-4" /> Make Super Admin
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {isDataAdmin ? (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => applyRole(null, `Data Admin removed from ${user.first_name || user.email}`)}
                >
                  <Database className="mr-2 h-4 w-4" /> Remove Data Admin
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => applyRole("data_admin", `${user.first_name || user.email} is now Data Admin`)}>
                  <Database className="mr-2 h-4 w-4" /> Make Data Admin
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
