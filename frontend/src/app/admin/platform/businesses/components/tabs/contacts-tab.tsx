"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, Contact as ContactIcon, Loader2, Mail, Phone, Pencil, Plus, Search, Star, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { createContact, deleteContactThunk, fetchContacts, updateContact } from "../../store/businesses-slice";
import {
  createInstitutionContact, deleteInstitutionContactThunk, fetchInstitutionContacts, fetchInstitutionInvitations,
  fetchInstitutionMembers, updateInstitutionContact,
} from "../../store/institution-detail-slice";
import type { CountryOption } from "@/app/admin/platform/categories/apis";
import type { Contact, ContactInput } from "../../apis/types";
import { ContactEditorSheet } from "../contacts/contact-editor-sheet";
import { DeleteContactDialog } from "../contacts/delete-contact-dialog";
import { InviteInstitutionMemberDialog } from "../members/invite-institution-member-dialog";

const PAGE_SIZE = 10;

export function ContactsTab({
  kind,
  id,
  countries,
  readOnly = false,
}: Readonly<{ kind: "business" | "institution"; id: number; countries: CountryOption[]; readOnly?: boolean }>) {
  const dispatch = useAppDispatch();
  const isInstitution = kind === "institution";
  const { items: contacts, status, total } = useAppSelector((state) =>
    isInstitution ? state.platformInstitutionDetail.contacts : state.platformBusinesses.contacts,
  );
  const members = useAppSelector((state) => state.platformInstitutionDetail.members.items);
  const invitations = useAppSelector((state) => state.platformInstitutionDetail.invitations.items);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [invitingContact, setInvitingContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // For the "Invite to platform" status indicator below — a generous limit since this is a
  // best-effort lookup across the whole institution, not the paginated view the Users tab shows.
  const statusFetchedRef = useRef(false);
  useEffect(() => {
    if (!isInstitution || statusFetchedRef.current) return;
    statusFetchedRef.current = true;
    // 100 is the backend's pagination cap (shared/pagination.ts) — a higher limit 400s.
    dispatch(fetchInstitutionMembers({ id, params: { limit: 100 } }));
    dispatch(fetchInstitutionInvitations({ id, params: { limit: 100 } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstitution, id]);

  /** Already has a real login (an accepted member) vs. an invite already sent but not yet
   * accepted vs. neither — drives which icon/state the row shows instead of the invite button. */
  const contactPlatformStatus = (c: Contact): "member" | "invited" | null => {
    if (!c.email) return null;
    const email = c.email.toLowerCase();
    if (members.some((m) => m.user?.email.toLowerCase() === email)) return "member";
    if (invitations.some((i) => i.email.toLowerCase() === email)) return "invited";
    return null;
  };

  const fetchPage = (p: number) => {
    const params = { search: search || undefined, page: p, limit: PAGE_SIZE };
    dispatch(isInstitution ? fetchInstitutionContacts({ id, params }) : fetchContacts({ id, params }));
  };

  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => fetchPage(1), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, id, isInstitution, search]);

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchPage(p);
  };

  const handleSave = async (input: ContactInput): Promise<boolean> => {
    try {
      if (editingContact) {
        await dispatch(
          isInstitution
            ? updateInstitutionContact({ id, contactId: editingContact.id, patch: input })
            : updateContact({ id, contactId: editingContact.id, patch: input }),
        ).unwrap();
        toast.success("Contact updated");
      } else {
        await dispatch(isInstitution ? createInstitutionContact({ id, input }) : createContact({ id, input })).unwrap();
        toast.success("Contact added");
      }
      return true;
    } catch (e) {
      toast.error(editingContact ? "Couldn't update contact" : "Couldn't add contact", { description: (e as Error).message });
      return false;
    }
  };

  const handleDelete = async () => {
    if (!deletingContact) return;
    setDeleting(true);
    try {
      await dispatch(
        isInstitution
          ? deleteInstitutionContactThunk({ id, contactId: deletingContact.id })
          : deleteContactThunk({ id, contactId: deletingContact.id }),
      ).unwrap();
      toast.success("Contact removed");
      setDeletingContact(null);
    } catch (e) {
      toast.error("Couldn't remove contact", { description: (e as Error).message });
    } finally {
      setDeleting(false);
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
        <p className="text-sm font-medium">No contacts yet</p>
        <p className="text-xs text-muted-foreground">Private records — visible only to Super Admins.</p>
      </div>
    );
  } else {
    list = (
      <div className="space-y-2">
        {contacts.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{c.full_name}</span>
                {c.job_title && <span className="text-xs text-muted-foreground">{c.job_title}</span>}
                {c.is_primary && (
                  <Badge variant="outline" className="gap-1 border-amber-200 text-amber-700">
                    <Star className="h-3 w-3 fill-current" /> Primary
                  </Badge>
                )}
              </div>
              <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                {c.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {c.email}
                  </span>
                )}
                {c.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {c.phone}
                  </span>
                )}
                {c.department && <span>{c.department}</span>}
              </p>
              {c.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {!readOnly && (
              <div className="flex shrink-0 gap-1">
                {isInstitution && c.email && (() => {
                  const platformStatus = contactPlatformStatus(c);
                  if (platformStatus === "member") {
                    return (
                      <span className="flex h-8 w-8 items-center justify-center text-emerald-600" title="Already has platform login">
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                    );
                  }
                  if (platformStatus === "invited") {
                    return (
                      <span className="flex h-8 w-8 items-center justify-center text-muted-foreground" title="Invitation sent, not yet accepted">
                        <Clock className="h-4 w-4" />
                      </span>
                    );
                  }
                  return (
                    <Button size="icon-sm" variant="ghost" onClick={() => setInvitingContact(c)} aria-label="Invite to platform" title="Invite to platform">
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  );
                })()}
                <Button size="icon-sm" variant="ghost" onClick={() => { setEditingContact(c); setEditorOpen(true); }} aria-label="Edit contact">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeletingContact(c)} aria-label="Remove contact">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ContactIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Contacts</span>
            <Badge variant="secondary">{total}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Private record — visible only to Super Admins. Never shown to the business or public.</p>
        </div>
        {!readOnly && (
          <Button className="h-10" onClick={() => { setEditingContact(null); setEditorOpen(true); }}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Contact
          </Button>
        )}
      </div>

      <div className="relative mb-3 w-1/3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-10 pl-9" placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {list}

      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}

      <ContactEditorSheet
        open={editorOpen}
        onOpenChange={(open) => { setEditorOpen(open); if (!open) setEditingContact(null); }}
        countries={countries}
        contact={editingContact}
        onSave={handleSave}
        saving={false}
      />
      <DeleteContactDialog
        contact={deletingContact}
        onOpenChange={(open) => { if (!open) setDeletingContact(null); }}
        onConfirm={handleDelete}
        deleting={deleting}
      />
      {isInstitution && (
        <InviteInstitutionMemberDialog
          open={!!invitingContact}
          onOpenChange={(open) => { if (!open) setInvitingContact(null); }}
          institutionId={id}
          prefill={invitingContact ? contactToInvitePrefill(invitingContact) : undefined}
        />
      )}
    </div>
  );
}

/** Splits the contact's single full_name into the invite form's separate first/last fields, and
 * strips any leading country-code digits contact.phone carries (see splitPhone in
 * contact-editor-sheet.tsx) down to a plain number, since the invite form has no country picker. */
function contactToInvitePrefill(c: Contact) {
  const [first, ...rest] = c.full_name.trim().split(/\s+/);
  return {
    first_name: first ?? "",
    last_name: rest.join(" "),
    email: c.email ?? "",
    phone: c.phone ?? "",
  };
}
