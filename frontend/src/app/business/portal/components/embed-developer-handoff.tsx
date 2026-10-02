"use client";

import { useId, useState } from "react";
import { Info, Mail, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { sendEmbedSnippet } from "@/app/business/ai-widget/store/ai-widget-slice";
import type { DeveloperContact } from "@/app/business/ai-widget/apis";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Who the snippet gets mailed to.
 *
 * Two states, and the difference between them matters: with a developer on the team this is one
 * button, but with none it INVITES the person typed in — real portal access — so the consequence is
 * written above the button rather than confessed in a toast afterwards.
 *
 * Errors appear on blur, not on every keystroke: an address is invalid for most of the time someone
 * is typing it, and saying so the whole way is nagging rather than helping.
 */
export function EmbedDeveloperHandoff({
  developer,
  orgName,
}: Readonly<{ developer: DeveloperContact | null; orgName: string }>) {
  const dispatch = useAppDispatch();
  const sending = useAppSelector((s) => s.aiWidget.sendStatus) === "loading";
  const fieldId = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState({ name: false, email: false });
  const [sentTo, setSentTo] = useState<string | null>(null);

  const nameError = !name.trim() ? "Enter their name so the invitation can greet them." : undefined;
  const emailError = !email.trim()
    ? "Enter the address to send the code to."
    : !EMAIL_RE.test(email.trim())
      ? "That doesn't look like an email address."
      : undefined;
  const showName = touched.name ? nameError : undefined;
  const showEmail = touched.email ? emailError : undefined;

  const send = async (invitee?: { name: string; email: string }) => {
    try {
      const result = await dispatch(sendEmbedSnippet(invitee ? { invitee } : {})).unwrap();
      setSentTo(result.sent_to);
      // Asked to invite someone but nobody was invited ⇒ they were already on the team. Say so, or
      // the admin is left expecting the invitation the note above the button promised.
      const alreadyOnTeam = !!invitee && !result.invited;
      toast.success(result.invited ? "Invited and sent" : "Code sent", {
        description: result.invited
          ? `${result.sent_to} is on your team as a Developer and has the code.`
          : alreadyOnTeam
            ? result.pending
              ? `${result.sent_to} already has an open invitation and hasn't accepted yet, so we sent the code without a new one.`
              : `${result.sent_to} is already on your team, so we sent the code without a new invitation.`
            : `We emailed the code to ${result.sent_to}.`,
      });
      setName("");
      setEmail("");
      setTouched({ name: false, email: false });
    } catch (e) {
      toast.error("Couldn't send the code", { description: typeof e === "string" ? e : "Please try again." });
    }
  };

  if (developer) {
    const label = developer.name || developer.email;
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary"
            >
              {label.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{label}</p>
              <p className="truncate text-xs text-muted-foreground">
                Developer · {developer.email}
                {developer.pending && " · hasn't accepted yet"}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => send()} disabled={sending} className="shrink-0 cursor-pointer">
            <Mail className="mr-1.5 h-4 w-4" aria-hidden />
            {sending ? "Sending…" : sentTo ? "Send again" : "Email the code"}
          </Button>
        </div>
        {/* Always mounted so the confirmation is announced when it arrives rather than when the
            region appears; `empty:mt-0` stops it reserving a blank line until then. */}
        <p role="status" className="mt-2 text-xs text-emerald-600 empty:mt-0 dark:text-emerald-400">
          {sentTo ? `Sent to ${sentTo}. It can take a minute to arrive.` : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <UserRound className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Send it to whoever looks after your website</p>
            <p className="text-sm text-muted-foreground">
              Nobody on your team is marked as a Developer yet.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-name`} className="text-xs font-medium text-muted-foreground">
                Their name
              </Label>
              <Input
                id={`${fieldId}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                aria-invalid={!!showName}
                aria-describedby={showName ? `${fieldId}-name-error` : undefined}
                placeholder="Sam Taylor"
              />
              <FieldError id={`${fieldId}-name-error`} message={showName} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-email`} className="text-xs font-medium text-muted-foreground">
                Their email
              </Label>
              <Input
                id={`${fieldId}-email`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                aria-invalid={!!showEmail}
                aria-describedby={showEmail ? `${fieldId}-email-error` : undefined}
                placeholder="sam@yoursite.com"
              />
              <FieldError id={`${fieldId}-email-error`} message={showEmail} />
            </div>
          </div>

          {/* The consequence, above the button that causes it — not in the toast afterwards. */}
          <p className="flex gap-2 rounded-md bg-background/60 p-2.5 text-xs leading-5 text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              If they&apos;re new, they&apos;ll join {orgName || "your team"} as a{" "}
              <strong className="font-medium text-foreground">Developer</strong> and can sign in to your
              portal — two emails go out, an invitation and the code. They won&apos;t see your enquiries.
              Already on your team? We just send the code and leave their role alone.
            </span>
          </p>

          <Button
            size="sm"
            onClick={() => {
              setTouched({ name: true, email: true });
              if (!nameError && !emailError) send({ name: name.trim(), email: email.trim() });
            }}
            disabled={sending}
            className="cursor-pointer"
          >
            <Send className="mr-1.5 h-4 w-4" aria-hidden />
            {sending ? "Sending…" : "Invite them and send the code"}
          </Button>
        </div>
      </div>
    </div>
  );
}
