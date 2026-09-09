"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { businessMessagesApi } from "@/app/business/messages/apis";
import type { ThreadMembersApi, ThreadMembersResult } from "./types";
import { AddThreadMembersDialog } from "./add-thread-members-dialog";
import { LeaveThreadDialog } from "./leave-thread-dialog";
import { ThreadMemberRow, memberName } from "./thread-member-row";

/**
 * The roster for one enquiry thread — GlobalyOS V2's Members section from
 * `ChatRightPanelEnhanced`, kept to what an enquiry needs.
 *
 * Mounted by BOTH portals. It used to be business-only, on the reasoning that showing a student
 * the agency's roster would disclose staff they never asked about — the disclosure is real, so it
 * is handled where it belongs: `listMembersAsStudent` withholds staff emails, roles and
 * assignment source, leaving names and faces. This component renders whatever it is given.
 *
 * The student appears in both copies. They are a party to the enquiry rather than a seat the
 * agency administers, which is why they have no `enquiry_thread_members` row and why every
 * mutation here is unreachable for them — server-side too, since each resolves its target through
 * that table.
 *
 * `can_manage` comes from the server rather than being derived from the role here, so the button
 * and the endpoint agree by construction. Hiding the controls is a courtesy either way — every
 * mutation is refused server-side for a non-admin.
 */
export function ThreadMembersSection({
  distributionId,
  api = businessMessagesApi,
  onLeft,
  leaveDescription = "You'll stop receiving messages from this student and it will disappear from your inbox. Your colleagues keep the conversation, and an admin can add you back.",
}: Readonly<{
  distributionId: string;
  /** Which portal's endpoints to read. Defaults to the business ones this started as. */
  api?: ThreadMembersApi;
  /** Called after leaving. The caller decides where to send them — the thread is no longer theirs. */
  onLeft?: () => void;
  /** What leaving costs the caller — different on each side, so the mounting portal says it. */
  leaveDescription?: string;
}>) {
  const [open, setOpen] = useState(true);
  const [data, setData] = useState<ThreadMembersResult | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .listMembers(distributionId)
      .then(setData)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    let active = true;
    api
      .listMembers(distributionId)
      .then((d) => active && setData(d))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [distributionId, api]);

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

          {visible.map((m) => (
            <ThreadMemberRow
              key={m.platform_user_id}
              member={m}
              isMe={m.platform_user_id === data?.my_user_id}
              canManage={!!data?.can_manage}
              busy={busyId === m.platform_user_id}
              canLeave={!!data?.can_leave}
              leaveBlockedReason={data?.leave_blocked_reason ?? null}
              onLeaveClick={() => setLeaveOpen(true)}
              onToggleAdmin={() =>
                act(m.platform_user_id, () =>
                  api.setMemberRole!(distributionId, m.platform_user_id, m.role === "admin" ? "member" : "admin"),
                )
              }
              onRemove={() =>
                act(m.platform_user_id, () => api.removeMember!(distributionId, m.platform_user_id))
              }
            />
          ))}

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
        description={leaveDescription}
        onConfirm={() => api.leaveThread(distributionId)}
        onLeft={() => onLeft?.()}
      />
    </>
  );
}
