"use client";

import { useRef } from "react";
import { Ban, MoreVertical, Pencil, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ROLE_DISPLAY } from "../../../consts";
import type { AdminUser } from "../apis/types";

export function UserRow({
  user, canManage, isSelf, onView, onEdit, onToggleActive,
}: Readonly<{
  user: AdminUser;
  canManage: boolean;
  isSelf: boolean;
  onView: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
}>) {
  // base-ui's Menu can leave a trailing "click" at the trigger's screen position after it
  // closes, which falls through to this row and reopens the view dialog underneath. Swallow
  // one row click right after any menu close to prevent that ghost click.
  const suppressClickRef = useRef(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (suppressClickRef.current) return;
        onView();
      }}
      onKeyDown={(e) => e.key === "Enter" && onView()}
      className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 cursor-pointer transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Avatar className="size-8">
          {user.photo_url && <AvatarImage src={user.photo_url} alt={user.name} />}
          <AvatarFallback>{user.name?.[0]?.toUpperCase() ?? "U"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!user.is_active && <Badge variant="outline">Suspended</Badge>}
        <Badge variant="secondary">{ROLE_DISPLAY[user.role]}</Badge>
        {canManage && (
          <DropdownMenu
            onOpenChange={(open) => {
              if (open) return;
              suppressClickRef.current = true;
              setTimeout(() => { suppressClickRef.current = false; }, 0);
            }}
          >
            <DropdownMenuTrigger
              onClick={(e) => e.stopPropagation()}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" /> Edit Role
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onToggleActive}
                disabled={isSelf}
                className={cn(user.is_active ? "text-destructive" : "text-emerald-600")}
              >
                {user.is_active ? <Ban className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {user.is_active ? "Suspend" : "Activate"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
