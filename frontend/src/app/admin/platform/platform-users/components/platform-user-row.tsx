import { Database, MoreHorizontal, Shield, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchPlatformUsers, setPlatformUserAdminRole } from "../store/platform-users-slice";
import type { ListParams, PlatformUser, PlatformUserAdminRole } from "../apis/types";

/** Column headers for the rows below — kept beside the row so the two can't drift apart. */
export const PLATFORM_USER_COLUMNS = [
  { label: "User" },
  { label: "Country", className: "hidden lg:table-cell" },
  { label: "Joined", className: "hidden md:table-cell" },
  { label: "Status" },
  { label: "Actions", className: "w-px", srOnly: true },
] as const;

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
    <TableRow>
      <TableCell primary>
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase",
              isAdmin ? "bg-primary-light text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            {initial}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-medium text-foreground">
                {user.first_name} {user.last_name}
              </span>
              {isSuperAdmin && (
                <Badge variant="secondary"><Shield /> Super Admin</Badge>
              )}
              {isDataAdmin && (
                <Badge variant="outline"><Database /> Data Admin</Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden text-muted-foreground lg:table-cell">{user.country || "—"}</TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">{joined}</TableCell>
      <TableCell>
        <Badge variant={active ? "success" : "destructive"}>{active ? "Active" : "Suspended"}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className={active ? "text-destructive hover:bg-destructive/10 hover:text-destructive" : "text-success hover:bg-success/10 hover:text-success"}
            onClick={onSuspend}
          >
            <ShieldOff className="mr-1 h-3.5 w-3.5" />
            {active ? "Suspend" : "Unsuspend"}
          </Button>
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`More actions for ${user.first_name || user.email}`}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
              >
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
      </TableCell>
    </TableRow>
  );
}
