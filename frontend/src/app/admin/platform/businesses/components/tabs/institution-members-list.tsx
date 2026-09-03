"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, Loader2, MoreVertical, Search, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchInstitutionMembers, setInstitutionMemberStatus } from "../../store/institution-detail-slice";

const PAGE_SIZE = 10;

export function InstitutionMembersList({
  institutionId,
  readOnly = false,
}: Readonly<{ institutionId: number; readOnly?: boolean }>) {
  const dispatch = useAppDispatch();
  const { items: members, status, total } = useAppSelector((state) => state.platformInstitutionDetail.members);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const fetchPage = (p: number) => {
    dispatch(fetchInstitutionMembers({ id: institutionId, params: { search: search || undefined, page: p, limit: PAGE_SIZE } }));
  };

  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => fetchPage(1), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, institutionId, search]);

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchPage(p);
  };

  const toggleStatus = async (platformUserId: number, active: boolean) => {
    try {
      await dispatch(setInstitutionMemberStatus({ id: institutionId, platformUserId, accountStatus: active ? 1 : 0 })).unwrap();
      toast.success(active ? "Member reinstated" : "Member suspended");
    } catch (e) {
      toast.error("Couldn't update member", { description: (e as Error).message });
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
        {members.map((m) => {
          const active = m.account_status === 1;
          return (
            <div key={m.id} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                  {(m.user?.first_name ?? "?").slice(0, 2)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.user ? `${m.user.first_name} ${m.user.last_name}` : "—"}</span>
                    {m.role_name && <span className="text-xs capitalize text-muted-foreground">{m.role_name}</span>}
                    {m.is_owner && <Badge variant="outline">Owner</Badge>}
                    {!active && <Badge variant="secondary">Suspended</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{[m.user?.email, m.user?.phone].filter(Boolean).join(" • ") || "—"}</p>
                </div>
              </div>
              {!m.is_owner && !readOnly && (
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => toggleStatus(m.platform_user_id, !active)} className={cn(active ? "text-destructive" : "text-emerald-600")}>
                      {active ? <Ban className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      {active ? "Suspend" : "Reinstate"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
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
    </div>
  );
}
