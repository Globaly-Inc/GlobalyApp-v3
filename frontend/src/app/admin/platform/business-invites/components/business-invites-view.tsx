"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { useConfirmDelete } from "@/app/admin/data/ai-knowledge/components/use-confirm-delete";
import { deleteInvite, fetchInvites, resendInvite, resendRequestedInvite, revokeInvite } from "../store/business-invites-slice";
import type { InviteStatus, OnboardingInvite } from "../apis/types";
import { InvitesTable } from "./invites-table";
import { InviteStatCards } from "./invite-stat-cards";
import { InvitesSearch } from "./invites-search";

export function BusinessInvitesView({ reloadKey = 0 }: Readonly<{ reloadKey?: number }>) {
  const dispatch = useAppDispatch();
  const { invites, page, limit, total, counts, status, error } = useAppSelector((state) => state.businessInvites);
  const [filter, setFilter] = useState<InviteStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const isSuperAdmin = useAppSelector((state) => state.admin.me?.role) === "super_admin";
  const { confirm, dialog: confirmDialog } = useConfirmDelete();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const latest = useRef({ filter, search, page, limit, count: invites.length });
  useEffect(() => {
    latest.current = { filter, search, page, limit, count: invites.length };
  });

  const load = (
    nextPage = 1,
    nextFilter = latest.current.filter,
    nextLimit = latest.current.limit,
    nextSearch = latest.current.search.trim(),
  ) =>
    dispatch(fetchInvites({
      page: nextPage,
      limit: nextLimit,
      status: nextFilter === "all" ? undefined : nextFilter,
      search: nextSearch || undefined,
    }));

  const lastKey = useRef<number | null>(null);
  useEffect(() => {
    if (lastKey.current === reloadKey) return;
    lastKey.current = reloadKey;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, dispatch]);

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  // `?resend=<id>` comes from the "Resend the invite" button in a new-link-requested email.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resendId = searchParams.get("resend");
  const resentRef = useRef(false);
  const [resendingFromEmail, setResendingFromEmail] = useState(false);
  useEffect(() => {
    if (!resendId || resentRef.current) return;
    resentRef.current = true;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("resend");
    router.replace(`${pathname}?${params}`, { scroll: false });
    setResendingFromEmail(true);
    setBusyId(resendId);
    dispatch(resendRequestedInvite(resendId)).then((outcome) => {
      setBusyId(null);
      setResendingFromEmail(false);
      if (resendRequestedInvite.rejected.match(outcome)) {
        toast.info("Nothing to resend", { description: outcome.error.message ?? "This invite can't be resent." });
      } else if (outcome.payload.email_status === "failed") {
        toast.error("The invite was renewed, but the email failed", { description: "Try Resend on the row below." });
      } else {
        toast.success("Invite resent", { description: "They'll get a fresh link, valid for 72 hours." });
      }
      load(latest.current.page);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resendId]);

  const handleFilter = (next: InviteStatus | "all") => {
    clearTimeout(searchTimer.current);
    setFilter(next);
    load(1, next);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(1, filter, limit, value.trim()), 300);
  };

  const reloadAfterChange = async () => {
    const { filter: wanted, search: searched, page: at } = latest.current;
    const outcome = await load(at);
    if (latest.current.filter !== wanted || latest.current.search !== searched) return;
    if (at > 1 && fetchInvites.fulfilled.match(outcome) && outcome.payload.data.length === 0) load(at - 1);
  };

  const runAction = async (invite: OnboardingInvite, action: "resend" | "revoke") => {
    setBusyId(invite.id);
    const outcome = action === "resend"
      ? await dispatch(resendInvite(invite.id))
      : await dispatch(revokeInvite(invite.id));
    setBusyId(null);
    if ("error" in outcome) {
      toast.error(`Couldn't ${action} invite`, { description: outcome.error.message ?? "Please try again." });
      return;
    }
    await reloadAfterChange();
    if (typeof outcome.payload === "object" && outcome.payload.email_status === "failed") {
      toast.error(`Couldn't email ${invite.email}`, { description: "The invite is still open — try Resend again." });
      return;
    }
    toast.success(action === "resend" ? `Invite resent to ${invite.email}` : `Invite to ${invite.email} revoked`);
  };

  const handleDelete = async (invite: OnboardingInvite) => {
    if (!(await confirm(`Delete the invitation to ${invite.email}?`))) return;
    setBusyId(invite.id);
    const outcome = await dispatch(deleteInvite(invite.id));
    setBusyId(null);
    if (deleteInvite.rejected.match(outcome)) {
      toast.error("Couldn't delete invite", { description: outcome.error.message ?? "Please try again." });
      return;
    }
    toast.success(`Invitation to ${invite.email} deleted`);
    const { page: at, count } = latest.current;
    load(count === 1 && at > 1 ? at - 1 : at);
  };

  return (
    <div>
      <InviteStatCards counts={counts} value={filter} onChange={handleFilter} loading={status === "loading"} />
      <InvitesSearch value={search} onChange={handleSearch} />

      <InvitesTable
        invites={invites}
        loading={status === "loading"}
        error={status === "failed" ? error : null}
        filtered={filter !== "all" || search.trim() !== ""}
        busyId={busyId}
        onResend={(invite) => runAction(invite, "resend")}
        onRevoke={(invite) => runAction(invite, "revoke")}
        onDelete={isSuperAdmin ? handleDelete : undefined}
        onRetry={() => load(page)}
      />

      {total > 0 && (
        <Pagination
          page={page}
          limit={limit}
          total={total}
          onPageChange={(p) => load(p)}
          onPageSizeChange={(size) => load(1, filter, size)}
          align="end"
        />
      )}
      {confirmDialog}
      {/* Blocks the whole app until the resend finishes: modal (focus trapped), no close button,
          and Escape / outside clicks are ignored because onOpenChange does nothing. */}
      <Dialog open={resendingFromEmail} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm" aria-busy>
          <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
            <DialogTitle>Resending the invite…</DialogTitle>
            <DialogDescription>Sending them a fresh link. This takes a few seconds — please don&apos;t close this page.</DialogDescription>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
