"use client";

import { EllipsisVertical, GraduationCap, LogOut, ShieldCheck, UserMinus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "./utils";
import type { ThreadMember } from "./types";

export const memberName = (m: ThreadMember) =>
  `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email || "Member";

/**
 * One line of the thread roster: who they are, what they are, and what may be done to them.
 *
 * Split out of ThreadMembersSection to keep that file under the repo's 300-line rule; it holds no
 * state of its own and every decision is handed to it, so the section stays the single place that
 * knows how to load and mutate the roster.
 *
 * `email` is simply rendered when present. Whether a viewer may see one is the server's call —
 * the student's payload nulls staff addresses — so there is no rule about it here.
 */
export function ThreadMemberRow({
  member,
  isMe,
  canManage,
  busy,
  canLeave,
  leaveBlockedReason,
  onLeaveClick,
  onToggleAdmin,
  onRemove,
}: Readonly<{
  member: ThreadMember;
  isMe: boolean;
  canManage: boolean;
  busy: boolean;
  canLeave: boolean;
  leaveBlockedReason: string | null;
  onLeaveClick: () => void;
  onToggleAdmin: () => void;
  onRemove: () => void;
}>) {
  const name = memberName(member);
  const isAdmin = member.role === "admin";
  // 'auto' members are the owner and the agent who paid — the thread's structural parties. The
  // server refuses to remove them; the menu does not offer it.
  const removable = member.source === "manual";
  // The other party to the enquiry, not a seat on this side of it. Nothing here applies to them:
  // no role to grant, no membership to revoke. The server would refuse both (its target lookup
  // goes through enquiry_thread_members, where they have no row), so offering the menu could only
  // ever produce an error.
  const isStudent = member.source === "student";

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
      <Avatar className="size-7 shrink-0">
        {member.photo_url && <AvatarImage src={member.photo_url} alt="" className="object-cover" />}
        <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        {member.email && <p className="truncate text-xs text-muted-foreground">{member.email}</p>}
      </div>

      {/* Student wins over Admin: on the business side these are never the same person, and which
          party someone belongs to matters more than what they may administer. */}
      {isStudent ? (
        <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
          <GraduationCap className="size-3" aria-hidden />
          Student
        </Badge>
      ) : (
        isAdmin && (
          <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
            <ShieldCheck className="size-3" aria-hidden />
            Admin
          </Badge>
        )
      )}

      {/* Your own row offers Leave; everyone else's offers the admin's controls. Both hang off the
          same three-dot trigger, which is why a plain member still gets one on their own line even
          though they can manage nobody. */}
      {isMe ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Your options" />}>
            <EllipsisVertical className="size-3.5" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem className="text-destructive" disabled={!canLeave} onClick={onLeaveClick}>
              <LogOut className="size-3.5" aria-hidden />
              Leave Space
            </DropdownMenuItem>
            {/* The server's sentence, not one assembled here — it already knows which of the
                conditions are unmet, and saying it twice is how they drift apart. */}
            {leaveBlockedReason && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">{leaveBlockedReason}</p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        canManage &&
        !isStudent && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-xs" aria-label={`Manage ${name}`} disabled={busy} />}
            >
              <EllipsisVertical className="size-3.5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onToggleAdmin}>
                <ShieldCheck className="size-3.5" aria-hidden />
                {isAdmin ? "Remove admin" : "Make admin"}
              </DropdownMenuItem>
              {removable && (
                <DropdownMenuItem className="text-destructive" onClick={onRemove}>
                  <UserMinus className="size-3.5" aria-hidden />
                  Remove from conversation
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      )}
    </div>
  );
}
