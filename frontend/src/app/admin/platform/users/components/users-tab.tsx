"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAppSelector } from "@/lib/hooks";
import { EditUserRoleDialog } from "./edit-user-role-dialog";
import { SuspendUserDialog } from "./suspend-user-dialog";
import { UserRow } from "./user-row";
import { UserViewDialog } from "./user-view-dialog";
import type { AdminUser } from "../apis/types";

type PaginatedList<T> = { data: T[]; page: number; limit: number; total: number; totalPages: number };

export function UsersTab({
  users, search, onSearchChange, loading, onPageChange,
}: Readonly<{
  users: PaginatedList<AdminUser>;
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  onPageChange: (page: number) => void;
}>) {
  const { me } = useAppSelector((state) => state.admin);
  const canManage = me?.role === "super_admin";
  const [viewingUser, setViewingUser] = useState<AdminUser | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [suspendingUser, setSuspendingUser] = useState<AdminUser | null>(null);

  return (
    <div>
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search users..."
          className="h-10 pl-9"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{users.total} user{users.total === 1 ? "" : "s"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && users.data.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && users.data.length === 0 && <p className="text-sm text-muted-foreground">No users found.</p>}
          {users.data.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              canManage={canManage}
              isSelf={me?.id === user.id}
              onView={() => setViewingUser(user)}
              onEdit={() => setEditingUser(user)}
              onToggleActive={() => setSuspendingUser(user)}
            />
          ))}
        </CardContent>
      </Card>

      <Pagination page={users.page} limit={users.limit} total={users.total} onPageChange={onPageChange} />

      <UserViewDialog user={viewingUser} onClose={() => setViewingUser(null)} />
      <EditUserRoleDialog key={editingUser?.id ?? "none"} user={editingUser} onClose={() => setEditingUser(null)} />
      <SuspendUserDialog user={suspendingUser} onClose={() => setSuspendingUser(null)} />
    </div>
  );
}
