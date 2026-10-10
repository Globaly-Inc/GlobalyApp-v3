"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, Send } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchBusinessCategoryOptions } from "@/app/admin/platform/categories/store/categories-slice";
import { INVITE_CATEGORY_SLUG } from "../const";
import { sendInvite } from "../store/business-invites-slice";
import { ExistingInviteNotice, useExistingInvite } from "./existing-invite-notice";
import { InviteEmailPreview } from "./invite-email-preview";

const emailSchema = z.email();

export function SendInvitationDialog({
  open,
  onOpenChange,
  onSent,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; onSent?: () => void }>) {
  const dispatch = useAppDispatch();
  const allCategories = useAppSelector((state) => state.platformCategories.businessCategoryOptions);
  const categories = useMemo(() => allCategories.filter((c) => c.slug === INVITE_CATEGORY_SLUG), [allCategories]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [fullName, setFullName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sending, setSending] = useState(false);

  const fetchedRef = useRef(false);
  const [categoriesFailed, setCategoriesFailed] = useState(false);
  const loadCategories = () => {
    fetchedRef.current = true;
    setCategoriesFailed(false);
    dispatch(fetchBusinessCategoryOptions()).then((outcome) => {
      if (!fetchBusinessCategoryOptions.rejected.match(outcome)) return;
      fetchedRef.current = false;
      setCategoriesFailed(true);
    });
  };
  useEffect(() => {
    if (!open || allCategories.length > 0 || fetchedRef.current) return;
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, allCategories.length]);

  const categoryOptions = useMemo(() => categories.map((c) => ({ value: String(c.id), label: c.name })), [categories]);
  // Only one category is offered, so it is picked for the admin rather than left as a required click.
  const category = categories.find((c) => String(c.id) === categoryId) ?? (categories.length === 1 ? categories[0] : undefined);
  const trimmedEmail = email.trim().toLowerCase();
  const emailValid = emailSchema.safeParse(trimmedEmail).success;
  const nameLabel = category?.slug === "institutions" ? "Institution name" : "Business name";
  const emailInvalid = !!email.trim() && !emailValid;
  const existing = useExistingInvite(emailValid ? trimmedEmail : "", open);
  const canSend = !sending && !!category && emailValid && !existing && !!name.trim() && !!fullName.trim();

  const close = () => {
    setEmail("");
    setName("");
    setFullName("");
    setCategoryId("");
    onOpenChange(false);
  };

  const handleSend = async () => {
    if (!category) return;
    setSending(true);
    const outcome = await dispatch(sendInvite({ email: trimmedEmail, name: name.trim(), full_name: fullName.trim(), business_category_id: category.id }));
    setSending(false);
    if (sendInvite.rejected.match(outcome)) {
      toast.error("Couldn't send invitation", { description: outcome.payload?.message ?? outcome.error.message ?? "Please try again." });
      return;
    }
    if (outcome.payload.email_status === "failed") {
      toast.error(`Invite created, but the email to ${trimmedEmail} failed`, { description: "Use Resend on the invites list to try again." });
    } else {
      toast.success(`Invitation sent to ${trimmedEmail}`);
    }
    onSent?.();
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[35rem] rounded-2xl">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend) handleSend();
          }}
        >
        <DialogHeader className="flex-row items-center gap-3 space-y-0">
          <span aria-hidden className="flex size-[42px] shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Mail className="h-5 w-5" />
          </span>
          <DialogTitle className="font-heading text-xl">Invite Business</DialogTitle>
          {/* Every field below carries its own hint and the footer says what sending does, so the
              standing description is only for screen readers, which announce it with the title. */}
          <DialogDescription className="sr-only">
            We email a sign-up link. Opening it creates their account and portal, then they sign in with a code sent to the same address.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-category">Business category</Label>
            <Combobox
              id="invite-category"
              options={categoryOptions}
              value={category ? String(category.id) : ""}
              onChange={setCategoryId}
              placeholder="Select a category"
              searchPlaceholder="Search categories..."
              loading={!categoriesFailed && allCategories.length === 0}
              aria-describedby="invite-category-hint"
            />
            <p id="invite-category-hint" className="text-xs text-muted-foreground">
              Decides what gets built when they accept, and what the next field is called. Institutions is the
              only category open to invites today, so it arrives chosen rather than as a required click.
            </p>
            {categoriesFailed && (
              <p className="text-xs text-destructive">
                Couldn&apos;t load categories.{" "}
                <button type="button" className="cursor-pointer font-medium underline" onClick={() => { setCategoriesFailed(false); loadCategories(); }}>
                  Try again
                </button>
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-name">{nameLabel}</Label>
            <Input id="invite-name" placeholder="University of Oxford" maxLength={240} autoComplete="off" aria-describedby="invite-name-hint" value={name} onChange={(e) => setName(e.target.value)} />
            <p id="invite-name-hint" className="text-xs text-muted-foreground">
              Shown in the email subject and on their portal. Use the name they call themselves.
            </p>
          </div>
          {/* One line of the form: who it is addressed to and where it goes. They are read and
              filled together, and the hint below belongs to both. */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-3">
              <div className="flex min-w-50 flex-1 flex-col gap-2">
                <Label htmlFor="invite-full-name">Who you&apos;re writing to</Label>
                <Input id="invite-full-name" placeholder="Their name" maxLength={200} autoComplete="off" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="flex min-w-55 flex-1 flex-col gap-2">
                <Label htmlFor="invite-email">Their email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="admissions@oxford.ac.uk"
                  autoComplete="off"
                  aria-invalid={emailInvalid}
                  aria-describedby={emailInvalid ? "invite-email-error" : "invite-email-hint"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {/* Under the field it is about, not under the row: with two fields side by side, a
                    shared line reads as an error against whichever one you were last in. */}
                {emailInvalid && (
                  <p id="invite-email-error" className="text-xs text-destructive">Enter a valid email address.</p>
                )}
              </div>
            </div>
            {!emailInvalid && (
              <p id="invite-email-hint" className="text-xs text-muted-foreground">
                The invitation and every sign-in code go here, so it must be an inbox they actually read.
              </p>
            )}
          </div>

          {existing && <ExistingInviteNotice invite={existing} />}

          <InviteEmailPreview categoryId={category?.id ?? null} name={name} />
        </div>

        {/* A strip, not a row of buttons floating under the last field: pulled out to the dialog's
            own edges so the rule reads as the end of the form. */}
        <DialogFooter className="-mx-6 -mb-6 mt-1 items-center gap-2 rounded-b-2xl border-t bg-muted/30 px-6 py-4 sm:justify-between sm:gap-2">
          <p className="max-w-[30ch] text-xs text-muted-foreground sm:mr-auto">Nothing is created until they open the link.</p>
          <Button type="button" variant="outline" className="cursor-pointer" disabled={sending} onClick={close}>Cancel</Button>
          <Button type="submit" className="cursor-pointer gap-2" disabled={!canSend}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending…" : "Send invitation"}
          </Button>
        </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
