"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Briefcase, Crown, Loader2, MoreHorizontal, Shield, Trash2, User, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { fetchMembers, removeMember, updateMember } from "../../store/business-profile-detail-slice";
import type { Member } from "../../apis/types";

const PAGE_SIZE = 10;

const ROLE_CONFIG: Record<string, { icon: typeof Crown; className: string }> = {
  owner: { icon: Crown, className: "bg-amber-100 text-amber-700 border-amber-200" },
  admin: { icon: Shield, className: "bg-blue-100 text-blue-700 border-blue-200" },
};
const DEFAULT_ROLE_CONFIG = { icon: User, className: "bg-muted text-muted-foreground" };

export function AcceptedMembersList({
  businessId,
  onEdit,
}: Readonly<{ businessId: number; onEdit: (member: Member) => void }>) {
  const dispatch = useAppDispatch();
  const { items: members, status, total } = useAppSelector((state) => state.businessProfileDetail.members);
  const { user } = useAuthState();
  const [page, setPage] = useState(1);

  const fetchedIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (fetchedIdRef.current === businessId) return;
    fetchedIdRef.current = businessId;
    dispatch(fetchMembers({ id: businessId, params: { page: 1, limit: PAGE_SIZE } }));
  }, [dispatch, businessId]);

  const handlePageChange = (p: number) => {
    setPage(p);
    dispatch(fetchMembers({ id: businessId, params: { page: p, limit: PAGE_SIZE } }));
  };

  const handleDelete = async (memberId: number) => {
    try {
      await dispatch(removeMember({ id: businessId, memberId })).unwrap();
      toast.success("Member removed");
    } catch (e) {
      toast.error("Couldn't remove member", { description: (e as Error).message });
    }
  };

  const handleVisibilityChange = async (memberId: number, is_public: boolean) => {
    try {
      await dispatch(updateMember({ id: businessId, memberId, patch: { is_public } })).unwrap();
      toast.success(is_public ? "Visible on public profile" : "Hidden from public profile");
    } catch (e) {
      toast.error("Couldn't update visibility", { description: (e as Error).message });
    }
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <Users className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">No members yet</p>
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Active Members ({total})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="p-3 text-left">Member</th>
                  <th className="hidden p-3 text-left sm:table-cell">Email</th>
                  <th className="p-3 text-left">Role</th>
                  <th className="hidden p-3 text-left md:table-cell">Position</th>
                  <th className="hidden p-3 text-left md:table-cell">Visibility</th>
                  <th className="hidden p-3 text-left md:table-cell">Joined</th>
                  <th className="w-12 p-3" />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const cfg = ROLE_CONFIG[m.is_owner ? "owner" : m.role] ?? DEFAULT_ROLE_CONFIG;
                  const RoleIcon = cfg.icon;
                  const isMe = m.email === user?.email;
                  return (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            {m.photo_url && <AvatarImage src={m.photo_url} alt="" />}
                            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                              {(m.first_name ?? "?").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate text-sm font-medium">
                              {m.first_name ? `${m.first_name} ${m.last_name}` : "—"}
                              {isMe && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">You</Badge>}
                            </p>
                            <p className="truncate text-xs text-muted-foreground sm:hidden">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden p-3 sm:table-cell">
                        <span className="text-sm text-muted-foreground">{m.email}</span>
                      </td>
                      <td className="p-3">
                        <Badge className={`${cfg.className} flex w-fit items-center gap-1 border-0`}>
                          <RoleIcon className="h-3 w-3" />
                          {m.is_owner ? "Owner" : m.role_display}
                        </Badge>
                      </td>
                      <td className="hidden p-3 md:table-cell">
                        <span className="text-sm text-muted-foreground">{m.position || "—"}</span>
                      </td>
                      <td className="hidden p-3 md:table-cell">
                        <Switch checked={m.is_public} onCheckedChange={(v) => handleVisibilityChange(m.id, v)} />
                      </td>
                      <td className="hidden p-3 md:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {new Date(m.created_at).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                      </td>
                      <td className="p-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Member actions" />}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onEdit(m)}>
                              <Briefcase className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            {!m.is_owner && (
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(m.id)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Remove
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}
    </>
  );
}
