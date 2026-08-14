"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchMembers, removeMember } from "../../store/businesses-slice";
import type { Member } from "../../apis/types";
import { AddMemberDrawer } from "../members/add-member-drawer";

const PAGE_SIZE = 10;

export function MembersTab({ businessId }: Readonly<{ businessId: number }>) {
  const dispatch = useAppDispatch();
  const { items: members, status, total } = useAppSelector((state) => state.platformBusinesses.members);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const fetchPage = (p: number) => {
    dispatch(fetchMembers({ id: businessId, params: { search: search || undefined, page: p, limit: PAGE_SIZE } }));
  };

  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => fetchPage(1), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, businessId, search]);

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchPage(p);
  };

  const handleDelete = async (memberId: number) => {
    try {
      await dispatch(removeMember({ id: businessId, memberId })).unwrap();
      toast.success("Member removed");
    } catch (e) {
      toast.error("Couldn't remove member", { description: (e as Error).message });
    }
  };

  let list: React.ReactNode;
  if (status === "loading") {
    list = (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  } else if (members.length === 0) {
    list = (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <Users className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">No members yet</p>
      </div>
    );
  } else {
    list = (
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                {(m.user?.first_name ?? "?").slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{m.user ? `${m.user.first_name} ${m.user.last_name}` : "—"}</span>
                  {m.role_display_name && <span className="text-xs text-muted-foreground">{m.role_display_name}</span>}
                  {m.admin_point_of_contact && <Badge variant="outline">POC</Badge>}
                  {m.account_status !== 1 && <Badge variant="secondary">Inactive</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{[m.user?.email, m.user?.phone].filter(Boolean).join(" • ") || "—"}</p>
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="icon-sm" variant="ghost" onClick={() => { setEditingMember(m); setDrawerOpen(true); }} aria-label="Edit member">
                <Pencil className="h-4 w-4" />
              </Button>
              {!m.is_owner && (
                <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(m.id)} aria-label="Remove member">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Members</span>
          <Badge variant="secondary">{total}</Badge>
        </div>
        <Button className="h-10" onClick={() => { setEditingMember(null); setDrawerOpen(true); }}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add member
        </Button>
      </div>

      <div className="relative mb-3 w-1/3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-10 pl-9"
          placeholder="Search members by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {list}

      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}

      <AddMemberDrawer open={drawerOpen} onOpenChange={setDrawerOpen} businessId={businessId} editingMember={editingMember} />
    </div>
  );
}
