"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchRepresentations, respondToRepresentation } from "../store/representations-slice";
import { InviteDialog } from "./invite-dialog";
import { RepresentationCard } from "./representation-card";

const SUB_TABS = [
  { value: "active" as const, label: "Active" },
  { value: "incoming" as const, label: "Incoming" },
  { value: "outgoing" as const, label: "Outgoing" },
];

export function RepresentationsView() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.businessRepresentations);
  const businessType = useAppSelector((s) => s.businessOnboarding.profile?.business_type);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tab, setTab] = useState<(typeof SUB_TABS)[number]["value"]>("active");

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchRepresentations());
  }, [dispatch]);

  const targetLabel = businessType === "agent" ? "institutions" : "agents";
  const active = items.filter((r) => r.status === "active");
  // "Incoming" = requests waiting on this business to respond; "outgoing" = everything else
  // this business either sent or is just waiting on the other side for.
  const incoming = items.filter((r) => r.status === "pending" && r.can_respond);
  const outgoing = items.filter((r) => r.status === "pending" && !r.can_respond);

  const handleRespond = async (id: string, status: "active" | "rejected") => {
    try {
      await dispatch(respondToRepresentation({ id, status })).unwrap();
      toast.success("Status updated!");
    } catch (e) {
      toast.error("Couldn't update status", { description: (e as Error).message });
    }
  };

  const list = tab === "active" ? active : tab === "incoming" ? incoming : outgoing;
  const emptyText = {
    active: "No active representations yet.",
    incoming: "No incoming requests.",
    outgoing: "No outgoing requests yet. Invite an institution or agent to get started.",
  }[tab];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Representations</h1>
          <p className="text-muted-foreground">Manage your B2B partnerships with {targetLabel}.</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />Invite to Represent
        </Button>
      </div>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} targetLabel={targetLabel} />

      {status === "loading" ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div>
          <AdminSegmentedTabs
            options={SUB_TABS.map((t) => ({
              value: t.value,
              label: `${t.label} (${t.value === "active" ? active.length : t.value === "incoming" ? incoming.length : outgoing.length})`,
            }))}
            value={tab}
            onChange={setTab}
          />
          <div className="space-y-3">
            {list.length > 0 ? (
              list.map((r) => (
                <RepresentationCard key={r.id} representation={r} onRespond={(status) => handleRespond(r.id, status)} />
              ))
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Users className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p>{emptyText}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
