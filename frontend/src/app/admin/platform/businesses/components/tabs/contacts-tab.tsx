"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Contact as ContactIcon, Loader2, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchContacts, removeMember } from "../../store/businesses-slice";
import type { Member } from "../../apis/types";
import { AddMemberDrawer } from "../members/add-member-drawer";

const PAGE_SIZE = 10;

export function ContactsTab({ businessId }: Readonly<{ businessId: number }>) {
  const dispatch = useAppDispatch();
  const { items: contacts, status, total } = useAppSelector((state) => state.platformBusinesses.contacts);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
    dispatch(fetchContacts({ id: businessId, params: { page: 1, limit: PAGE_SIZE } }));
  }, [dispatch, businessId]);

  const handlePageChange = (p: number) => {
    setPage(p);
    dispatch(fetchContacts({ id: businessId, params: { page: p, limit: PAGE_SIZE } }));
  };

  const handleDelete = async (memberId: number) => {
    try {
      await dispatch(removeMember({ id: businessId, memberId })).unwrap();
      toast.success("Contact removed");
    } catch (e) {
      toast.error("Couldn't remove contact", { description: (e as Error).message });
    }
  };

  let list: React.ReactNode;
  if (status === "loading") {
    list = (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  } else if (contacts.length === 0) {
    list = (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <ContactIcon className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">No point of contact set</p>
        <p className="text-xs text-muted-foreground">Mark a member as the point of contact for super admin.</p>
      </div>
    );
  } else {
    list = (
      <div className="space-y-2">
        {contacts.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{c.user ? `${c.user.first_name} ${c.user.last_name}` : "—"}</span>
                {c.role_display_name && <span className="text-xs text-muted-foreground">{c.role_display_name}</span>}
                <Badge variant="outline">POC</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{[c.user?.email, c.user?.phone].filter(Boolean).join(" • ") || "—"}</p>
            </div>
            <div className="flex gap-1">
              <Button size="icon-sm" variant="ghost" onClick={() => { setEditingMember(c); setDrawerOpen(true); }} aria-label="Edit contact">
                <Pencil className="h-4 w-4" />
              </Button>
              {!c.is_owner && (
                <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(c.id)} aria-label="Remove contact">
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
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <ContactIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Contacts</span>
          <Badge variant="secondary">{total}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">These are the points of contact for super admin.</p>
      </div>

      {list}

      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}

      <AddMemberDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        businessId={businessId}
        forcePointOfContact
        title="Add Contact"
        description="Invites this person and sets them as the point of contact for super admin."
        editingMember={editingMember}
      />
    </div>
  );
}
