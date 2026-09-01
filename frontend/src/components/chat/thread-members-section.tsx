"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  EllipsisVertical,
  LogOut,
  Search,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { businessMessagesApi } from "@/app/business/messages/apis";
import type { ThreadMember, ThreadMembersResult } from "@/app/business/messages/apis";
import { AddThreadMembersDialog } from "./add-thread-members-dialog";
import { LeaveThreadDialog } from "./leave-thread-dialog";
import { initials } from "./utils";

const memberName = (m: ThreadMember) =>
  `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email || "Member";

/**
 * The roster for one enquiry thread — GlobalyOS V2's Members section from
 * `ChatRightPanelEnhanced`, kept to what an enquiry needs.
 *
 * Business side only. The student's counterpart is the person they enquired to, already named in
 * the header; showing them the agency's internal roster would disclose staff they never asked
 * about.
 *
 * `can_manage` comes from the server rather than being derived from the role here, so the button
 * and the endpoint agree by construction. Hiding the controls is a courtesy either way — every
 * mutation is refused server-side for a non-admin.
 */
export function ThreadMembersSection({
  distributionId,
  onLeft,
}: Readonly<{
  distributionId: string;
  /** Called after leaving. The caller decides where to send them — the thread is no longer theirs. */
  onLeft?: () => void;
}>) {
  const [open, setOpen] = useState(true);
  const [data, setData] = useState<ThreadMembersResult | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    businessMessagesApi
      .listMembers(distributionId)
      .then(setData)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    let active = true;
    businessMessagesApi
      .listMembers(distributionId)
      .then((d) => active && setData(d))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [distributionId]);

  const act = async (userId: number, fn: () => Promise<unknown>) => {
    setBusyId(userId);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      // The server's own wording — it knows why (last admin, structural member, not an admin).
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const members = useMemo(() => data?.members ?? [], [data]);

  // Client-side, unlike the add-members picker: the roster is already in hand and small, so a round
  // trip per keystroke would buy nothing. Name and email both match — an agency addressing someone
  // by their work address is as likely as by their name.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => memberName(m).toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q),
    );
  }, [members, query]);

  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex flex-1 items-center gap-2 text-left text-sm font-semibold"
        >
          <Users className="size-4 text-muted-foreground" aria-hidden />
          Members
          {members.length > 0 && <span className="text-muted-foreground">({members.length})</span>}
          {open ? (
            <ChevronUp className="ml-auto size-4 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="ml-auto size-4 text-muted-foreground" aria-hidden />
          )}
        </button>
        {data?.can_manage && open && (
          <Button variant="ghost" size="icon-sm" aria-label="Add members" onClick={() => setAddOpen(true)}>
            <UserPlus className="size-4" aria-hidden />
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-1 px-2 py-2">
          {error && <p className="px-2 pb-1 text-xs text-destructive">{error}</p>}

          {/* Shown from two members up: below that there is nothing to search through. */}
          {members.length > 1 && (
            <div className="relative px-2 pb-1">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search members..."
                aria-label="Search members"
                className="h-8 pl-7 text-sm"
              />
            </div>
          )}

          {visible.map((m) => {
            const name = memberName(m);
            const isAdmin = m.role === "admin";
            const isMe = m.platform_user_id === data?.my_user_id;
            // 'auto' members are the owner and the agent who paid — the thread's structural
            // parties. The server refuses to remove them; the menu does not offer it.
            const removable = m.source === "manual";
            return (
              <div key={m.platform_user_id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                <Avatar className="size-7 shrink-0">
                  {m.photo_url && <AvatarImage src={m.photo_url} alt="" className="object-cover" />}
                  <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{initials(name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name}</p>
                  {m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
                </div>
                {isAdmin && (
                  <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                    <ShieldCheck className="size-3" aria-hidden />
                    Admin
                  </Badge>
                )}
                {/* Your own row offers Leave; everyone else's offers the admin's controls. Both
                    hang off the same three-dot trigger, which is why a plain member still gets one
                    on their own line even though they can manage nobody. */}
                {isMe ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-xs" aria-label="Your options" />}
                    >
                      <EllipsisVertical className="size-3.5" aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuItem
                        className="text-destructive"
                        disabled={!data?.can_leave}
                        onClick={() => setLeaveOpen(true)}
                      >
                        <LogOut className="size-3.5" aria-hidden />
                        Leave Space
                      </DropdownMenuItem>
                      {/* The server's sentence, not one assembled here — it already knows which of
                          the conditions are unmet, and saying it twice is how they drift apart. */}
                      {data?.leave_blocked_reason && (
                        <p className="px-2 py-1.5 text-xs text-muted-foreground">{data.leave_blocked_reason}</p>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  data?.can_manage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Manage ${name}`}
                          disabled={busyId === m.platform_user_id}
                        />
                      }
                    >
                      <EllipsisVertical className="size-3.5" aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() =>
                          act(m.platform_user_id, () =>
                            businessMessagesApi.setMemberRole(
                              distributionId,
                              m.platform_user_id,
                              isAdmin ? "member" : "admin",
                            ),
                          )
                        }
                      >
                        <ShieldCheck className="size-3.5" aria-hidden />
                        {isAdmin ? "Remove admin" : "Make admin"}
                      </DropdownMenuItem>
                      {removable && (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() =>
                            act(m.platform_user_id, () =>
                              businessMessagesApi.removeMember(distributionId, m.platform_user_id),
                            )
                          }
                        >
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
          })}

          {members.length === 0 && !error && (
            <p className={cn("px-2 py-3 text-center text-sm text-muted-foreground")}>Loading members…</p>
          )}

          {members.length > 0 && visible.length === 0 && (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">No members match “{query}”.</p>
          )}

        </div>
      )}

      {data?.can_manage && (
        <AddThreadMembersDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          distributionId={distributionId}
          onAdded={load}
        />
      )}

      <LeaveThreadDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        description="You'll stop receiving messages from this student and it will disappear from your inbox. Your colleagues keep the conversation, and an admin can add you back."
        onConfirm={() => businessMessagesApi.leaveThread(distributionId)}
        onLeft={() => onLeft?.()}
      />
    </>
  );
}
