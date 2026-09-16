"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Contact as ContactIcon, Loader2, Mail, Phone, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { createContact, deleteContactThunk, fetchContacts, updateContact } from "../../store/businesses-slice";
import {
  createInstitutionContact, deleteInstitutionContactThunk, fetchInstitutionContacts, updateInstitutionContact,
} from "../../store/institution-detail-slice";
import type { CountryOption } from "@/app/admin/platform/categories/apis";
import type { Contact, ContactInput } from "../../apis/types";
import { ContactEditorSheet } from "../contacts/contact-editor-sheet";
import { DeleteContactDialog } from "../contacts/delete-contact-dialog";

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
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

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
    </div>
  );
}
