"use client";

import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pagination } from "@/components/ui/pagination";
import { ROLE_DISPLAY } from "../../../consts";
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
            <div key={user.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
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
                {user.account_status === 0 && <Badge variant="outline">Suspended</Badge>}
                {!user.is_email_verified && <Badge variant="outline">Unverified</Badge>}
                <Badge variant="secondary">{ROLE_DISPLAY[user.role]}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Pagination page={users.page} limit={users.limit} total={users.total} onPageChange={onPageChange} />
    </div>
  );
}
