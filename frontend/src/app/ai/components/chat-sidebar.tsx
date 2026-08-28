"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  MoreHorizontal,
  Archive,
  ArchiveRestore,
  Check,
  Pencil,
  MessagesSquare,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setActiveSession, updateSession, deleteSession, fetchMessages } from "../store/ai-chat-slice";
import type { ChatSession } from "../apis/types";
import { useConfirmAction } from "./use-confirm-action";
import { cn } from "@/lib/utils";

type ChatSidebarProps = {
  onNewChat: () => void;
};

/** Group sessions by recency. */
function groupSessions(sessions: ChatSession[]) {
  const now = Date.now();
  const dayMs = 86400 * 1000;
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - dayMs;
  const weekStart = todayStart - 6 * dayMs;

  const today: ChatSession[] = [];
  const yesterday: ChatSession[] = [];
  const thisWeek: ChatSession[] = [];
  const older: ChatSession[] = [];

  for (const s of sessions) {
    const t = new Date(s.updated_at).getTime();
    if (t >= todayStart) today.push(s);
    else if (t >= yesterdayStart) yesterday.push(s);
    else if (t >= weekStart) thisWeek.push(s);
    else older.push(s);
  }

  const groups = [
    { label: "Today", sessions: today },
    { label: "Yesterday", sessions: yesterday },
    { label: "This Week", sessions: thisWeek },
    { label: "Older", sessions: older },
  ].filter((g) => g.sessions.length > 0);

  return groups;
}

export function ChatSidebar({ onNewChat }: ChatSidebarProps) {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector((s) => s.aiChat.sessions);
  const activeSessionId = useAppSelector((s) => s.aiChat.activeSessionId);
  const profile = useAppSelector((s) => s.profile.profile);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [view, setView] = useState<"chats" | "archived">("chats");
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const showArchived = view === "archived";
  const groups = groupSessions(sessions.filter((s) => s.is_archived === showArchived));

  const selectSession = (id: number) => {
    if (id === activeSessionId) return;
    dispatch(setActiveSession(id));
    dispatch(fetchMessages(id));
  };

  const startRename = (session: ChatSession) => {
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const commitRename = () => {
    if (editingId && editTitle.trim()) {
      dispatch(updateSession({ sessionId: editingId, data: { title: editTitle.trim() } }));
    }
    setEditingId(null);
  };

  const setArchived = async (session: ChatSession, archived: boolean) => {
    // Unarchiving is non-destructive — no confirm needed there.
    if (archived) {
      const ok = await confirm({
        title: `Archive "${session.title}"?`,
        description: "It leaves your chat list but stays available under the Archived filter.",
        action: "Archive",
      });
      if (!ok) return;
    }
    dispatch(updateSession({ sessionId: session.id, data: { is_archived: archived } }));
  };

  const removeSession = async (session: ChatSession) => {
    const ok = await confirm({
      title: `Delete "${session.title}"?`,
      description: "This chat and its messages are removed permanently. This cannot be undone.",
      action: "Delete",
      destructive: true,
    });
    if (ok) dispatch(deleteSession(session.id));
  };

  return (
    <div className="flex h-full flex-col">
      {/* New chat is the sidebar's primary action and sits alone at the top, ahead of the
          list header — the archived toggle moved into that header's filter menu so it stops
          competing with it. */}
      <div className="p-2">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-lg bg-accent/60 px-2.5 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Plus className="size-4" /> New chat
        </button>
      </div>

      <div className="flex items-center justify-between px-4 pt-2 pb-1">
        <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {showArchived ? "Archived" : "Chats"}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="ghost" size="icon-xs" render={<span />} aria-label="Filter chats">
              <SlidersHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(["chats", "archived"] as const).map((tab) => (
              <DropdownMenuItem key={tab} onClick={() => setView(tab)} className="capitalize">
                {view === tab ? <Check /> : <span className="size-4" />} {tab}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.label} className="px-2 py-2">
            <p className="mb-1 px-2 text-[10px] font-semibold text-foreground uppercase tracking-wider">
              {group.label}
            </p>
            {group.sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  // Neutral fills, no tinted highlight — the active chat reads like a selected
                  // row in the list, not like a call-to-action button.
                  "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm cursor-pointer transition-colors",
                  session.id === activeSessionId
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
                onClick={() => selectSession(session.id)}
                onDoubleClick={() => startRename(session)}
              >
                {editingId === session.id ? (
                  <input
                    className="flex-1 rounded bg-background px-1 text-sm outline-none ring-1 ring-ring"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  // ponytail: native title tooltip shows the full name — swap for ui/tooltip if design wants styled hovers
                  <span className="flex-1 truncate" title={session.title}>{session.title}</span>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="opacity-0 group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button variant="ghost" size="icon-xs" render={<span />}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start">
                    <DropdownMenuItem onClick={() => startRename(session)}>
                      <Pencil /> Rename
                    </DropdownMenuItem>
                    {session.is_archived ? (
                      <DropdownMenuItem onClick={() => setArchived(session, false)}>
                        <ArchiveRestore /> Unarchive
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => setArchived(session, true)}>
                        <Archive /> Archive
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem variant="destructive" onClick={() => removeSession(session)}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        ))}

        {groups.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <MessagesSquare className="size-4" />
            </span>
            <p className="text-xs text-muted-foreground">
              {showArchived ? "No archived chats" : "No conversations yet"}
            </p>
          </div>
        )}
      </div>

      {/* Identity pinned to the bottom of the rail, matching the rest of the portal's chrome. */}
      <div className="border-t p-2">
        <Link
          href="/personal/profile"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/60"
        >
          <Avatar className="size-7">
            <AvatarImage src={profile?.photo_url ?? undefined} alt="" />
            <AvatarFallback>{profile?.first_name?.[0]?.toUpperCase() ?? "U"}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate text-sm">
            {profile?.first_name ?? "Your account"}
          </span>
        </Link>
      </div>
      {confirmDialog}
    </div>
  );
}
