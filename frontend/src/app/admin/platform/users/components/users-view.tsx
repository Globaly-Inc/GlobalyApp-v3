"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { fetchInvitations } from "../store/users-slice";
import { PlatformUsersTab } from "./platform-users-tab";
import { InvitationsTab } from "./invitations-tab";

const TABS = [
  { value: "users" as const, label: "Users" },
  { value: "invitations" as const, label: "Admin Invitations" },
];

export function UsersView() {
  const dispatch = useAppDispatch();
  const { invitations, invitationsStatus } = useAppSelector((state) => state.adminUsers);

  const [tab, setTab] = useState<"users" | "invitations">("users");
  const [invitationsSearch, setInvitationsSearch] = useState("");
  const [debouncedInvitationsSearch, setDebouncedInvitationsSearch] = useState("");
  const invitationsSearchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleInvitationsSearchChange = (value: string) => {
    setInvitationsSearch(value);
    clearTimeout(invitationsSearchTimer.current);
    invitationsSearchTimer.current = setTimeout(() => setDebouncedInvitationsSearch(value), 300);
  };

  const lastInvitationsFetchKey = useRef<string | null>(null);
  useEffect(() => {
    if (tab !== "invitations") return;
    const key = JSON.stringify({ search: debouncedInvitationsSearch });
    if (lastInvitationsFetchKey.current === key) return;
    lastInvitationsFetchKey.current = key;
    dispatch(fetchInvitations({ search: debouncedInvitationsSearch || undefined, limit: 10 }));
  }, [dispatch, tab, debouncedInvitationsSearch]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="text-muted-foreground mt-1">Manage users and pending admin invitations.</p>
      </div>

      <AdminSegmentedTabs options={TABS} value={tab} onChange={setTab} />

      {tab === "users" && <PlatformUsersTab />}
      {tab === "invitations" && (
        <InvitationsTab
          invitations={invitations}
          search={invitationsSearch}
          onSearchChange={handleInvitationsSearchChange}
          loading={invitationsStatus === "loading"}
          onPageChange={(page) => dispatch(fetchInvitations({ search: debouncedInvitationsSearch || undefined, page, limit: 10 }))}
        />
      )}
    </div>
  );
}
