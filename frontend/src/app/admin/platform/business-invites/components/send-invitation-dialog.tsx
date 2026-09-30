"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, MailPlus, Send } from "lucide-react";
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
import type { EmailMatch } from "../apis/types";
import { EmailMatchesNotice } from "./email-matches-notice";

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
  const [categoryId, setCategoryId] = useState("");
  const [sending, setSending] = useState(false);
  const [matches, setMatches] = useState<EmailMatch[]>([]);

  const fetchedRef = useRef(false);
  const [categoriesFailed, setCategoriesFailed] = useState(false);
  const loadCategories = () => {
    fetchedRef.current = true;
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
  const canSend = !sending && !!category && emailValid && !!name.trim() && matches.length === 0;

  const close = () => {
    setEmail("");
    setName("");
    setCategoryId("");
    setMatches([]);
    onOpenChange(false);
  };

  const handleSend = async () => {
    if (!category) return;
    setSending(true);
    const outcome = await dispatch(sendInvite({ email: trimmedEmail, name: name.trim(), business_category_id: category.id }));
    setSending(false);
    if (sendInvite.rejected.match(outcome)) {
      if (outcome.payload?.matches.length) setMatches(outcome.payload.matches);
      else toast.error("Couldn't send invitation", { description: outcome.payload?.message ?? outcome.error.message ?? "Please try again." });
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
      <DialogContent>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend) handleSend();
          }}
        >
        <DialogHeader className="flex-row items-start gap-3 space-y-0">
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MailPlus className="h-5 w-5" />
          </span>
          <div className="flex flex-col gap-1">
            <DialogTitle>Invite Business</DialogTitle>
            <DialogDescription>
              We email a sign-up link. Opening it creates their account and portal, then they sign in with a code sent to the same address.
            </DialogDescription>
          </div>
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
            />
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
            <Input id="invite-name" placeholder="University of Oxford" maxLength={240} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="admissions@oxford.ac.uk"
              autoComplete="off"
              aria-invalid={emailInvalid}
              aria-describedby="invite-email-hint"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setMatches([]); }}
            />
            <p id="invite-email-hint" className={emailInvalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {emailInvalid ? "Enter a valid email address." : "The invitation and sign-in codes go to this address."}
            </p>
          </div>
          {matches.length > 0 && <EmailMatchesNotice matches={matches} />}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
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
