"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { fetchInvitations, fetchUsers } from "../store/users-slice";
import { UsersTab } from "./users-tab";
import { InvitationsTab } from "./invitations-tab";

const TABS = [
  { value: "users" as const, label: "Users" },
  { value: "invitations" as const, label: "Admin Invitations" },
];

export function UsersView() {
  const dispatch = useAppDispatch();
  const { users, usersStatus, invitations, invitationsStatus } = useAppSelector((state) => state.adminUsers);

  const [tab, setTab] = useState<"users" | "invitations">("users");
  const [usersSearch, setUsersSearch] = useState("");
  const [debouncedUsersSearch, setDebouncedUsersSearch] = useState("");
  const [invitationsSearch, setInvitationsSearch] = useState("");
  const [debouncedInvitationsSearch, setDebouncedInvitationsSearch] = useState("");
  const usersSearchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const invitationsSearchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleUsersSearchChange = (value: string) => {
    setUsersSearch(value);
    clearTimeout(usersSearchTimer.current);
    usersSearchTimer.current = setTimeout(() => setDebouncedUsersSearch(value), 300);
  };

  const handleInvitationsSearchChange = (value: string) => {
    setInvitationsSearch(value);
    clearTimeout(invitationsSearchTimer.current);
    invitationsSearchTimer.current = setTimeout(() => setDebouncedInvitationsSearch(value), 300);
  };

  const lastUsersFetchKey = useRef<string | null>(null);
  useEffect(() => {
    if (tab !== "users") return;
    const key = JSON.stringify({ search: debouncedUsersSearch });
    if (lastUsersFetchKey.current === key) return;
    lastUsersFetchKey.current = key;
    dispatch(fetchUsers({ search: debouncedUsersSearch || undefined }));
  }, [dispatch, tab, debouncedUsersSearch]);

  const lastInvitationsFetchKey = useRef<string | null>(null);
  useEffect(() => {
    if (tab !== "invitations") return;
    const key = JSON.stringify({ search: debouncedInvitationsSearch });
    if (lastInvitationsFetchKey.current === key) return;
    lastInvitationsFetchKey.current = key;
    dispatch(fetchInvitations({ search: debouncedInvitationsSearch || undefined }));
  }, [dispatch, tab, debouncedInvitationsSearch]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="text-muted-foreground mt-1">Manage admin accounts and pending admin invitations.</p>
      </div>

      <AdminSegmentedTabs options={TABS} value={tab} onChange={setTab} />

      {tab === "users" ? (
        <UsersTab
          users={users}
          search={usersSearch}
          onSearchChange={handleUsersSearchChange}
          loading={usersStatus === "loading"}
          onPageChange={(page) => dispatch(fetchUsers({ search: debouncedUsersSearch || undefined, page }))}
        />
      ) : (
        <InvitationsTab
          invitations={invitations}
          search={invitationsSearch}
          onSearchChange={handleInvitationsSearchChange}
          loading={invitationsStatus === "loading"}
          onPageChange={(page) => dispatch(fetchInvitations({ search: debouncedInvitationsSearch || undefined, page }))}
        />
      )}
    </div>
  );
}
