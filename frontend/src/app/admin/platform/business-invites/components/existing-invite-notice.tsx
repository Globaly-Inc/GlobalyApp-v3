"use client";

import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import { businessInvitesApi } from "../apis";
import type { OnboardingInvite } from "../apis/types";

const DAY = 86_400_000;
const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * The address is looked up while they type, because the dead end is otherwise only reachable by
 * pressing Send: onboarding_invitations_pending_email_uniq is on status='pending' alone, and an
 * expired invite is still that row — so both a live and a lapsed invite refuse a second send with
 * "Already invited", after four fields have been filled in.
 */
export function useExistingInvite(email: string, enabled: boolean): OnboardingInvite | null {
  // Keyed by the address it answers for, so a half-typed address never shows the previous one's
  // result and the effect never has to clear state on the way in.
  const [found, setFound] = useState<{ email: string; invite: OnboardingInvite | null }>({ email: "", invite: null });

  useEffect(() => {
    if (!enabled || !email) return;
    let live = true;
    const timer = setTimeout(() => {
      businessInvitesApi
        .listInvites({ search: email, limit: 5 })
        .then(({ data }) => {
          if (!live) return;
          const match = data.find((i) => i.email.toLowerCase() === email && (i.status === "pending" || i.status === "expired"));
          setFound({ email, invite: match ?? null });
        })
        // A failed lookup says nothing about the address, so it says nothing at all: the send still
        // runs and a 409 is reported the way it was before.
        .catch(() => live && setFound({ email, invite: null }));
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [email, enabled]);

  return enabled && found.email === email ? found.invite : null;
}

/** "and expires in 2 days" / "and expired on 2 Oct 2026" — the half of the sentence that says how
 *  much of the existing invite is left. */
function expiryPhrase(invite: OnboardingInvite): string {
  if (invite.status === "expired") return `and expired on ${formatDate(invite.expires_at)}`;
  const days = Math.ceil((new Date(invite.expires_at).getTime() - Date.now()) / DAY);
  return days <= 1 ? "and expires tomorrow" : `and expires in ${days} days`;
}

export function ExistingInviteNotice({ invite }: Readonly<{ invite: OnboardingInvite }>) {
  const when = expiryPhrase(invite);

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10"
    >
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <p className="text-xs leading-5 text-amber-900 dark:text-amber-200">
        <strong className="font-semibold">An invitation to this address already exists</strong> — sent{" "}
        {formatDate(invite.created_at)} {when}. A second one is refused while it stands, so use{" "}
        <strong className="font-semibold">Resend</strong> on its row in the Invites tab to send them a fresh link.
      </p>
    </div>
  );
}
