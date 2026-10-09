"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Briefcase, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { fetchMembers, removeMember, updateMember } from "../../store/business-profile-detail-slice";
import type { Member } from "../../apis/types";
import { ACTIONS, rowDelay, STICKY_TD, STICKY_TH, TABLE, TABLE_WRAP, TD, TH, TR } from "../portal-ui/portal-ui";
import { CHIP, RoleChip } from "./role-chip";
import { MemberAvatar, memberName } from "./member-avatar";
import { TeamEmpty } from "./team-empty";

const PAGE_SIZE = 10;
/** Mockup `.fresh`: small mono muted date. */
const FRESH = "whitespace-nowrap font-mono text-[11px] font-medium text-muted-foreground";
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });

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
    return <TeamEmpty title="No members yet" hint="Invite a colleague to help manage this profile." />;
  }

  return (
    <>
      <div className={TABLE_WRAP}>
        <table className={cn(TABLE, "min-w-240")}>
          <thead>
            <tr>
              <th className={TH}>Member</th>
              <th className={TH}>Role</th>
              <th className={TH}>Position</th>
              <th className={TH}>Visibility</th>
              <th className={TH}>Joined</th>
              <th className={cn(TH, STICKY_TH)}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => (
              <tr key={m.id} className={TR} style={rowDelay(i)}>
                <td className={TD}>
                  <div className="flex min-w-0 items-center gap-3">
                    <MemberAvatar member={m} />
                    <div className="min-w-0">
                      <b className="flex items-center gap-1.5 text-sm">
                        <span className="truncate">{memberName(m) || "—"}</span>
                        {m.email === user?.email && <span className={CHIP}>You</span>}
                      </b>
                      <small className="block truncate text-[12.5px] text-muted-foreground">{m.email}</small>
                    </div>
                  </div>
                </td>
                <td className={TD}>
                  <RoleChip role={m.role} label={m.role_display} owner={m.is_owner} />
                </td>
                <td className={TD}>
                  {m.position || <span className="text-muted-foreground">—</span>}
                </td>
                <td className={TD}>
                  <label className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
                    <Switch checked={m.is_public} onCheckedChange={(v) => handleVisibilityChange(m.id, v)} aria-label="Show on public profile" />
                    {m.is_public ? "On profile" : "Hidden"}
                  </label>
                </td>
                <td className={TD}>
                  <span className={FRESH}>{fmtDate(m.created_at)}</span>
                </td>
                <td className={cn(TD, STICKY_TD)}>
                  <div className={ACTIONS}>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" className="size-7.5 rounded-lg text-muted-foreground hover:text-foreground" aria-label="Member actions" />
                        }
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}
    </>
  );
}
