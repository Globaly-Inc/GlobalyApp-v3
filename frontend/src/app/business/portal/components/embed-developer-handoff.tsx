"use client";

import { useState } from "react";
import { Mail, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { forgetEmbedDeveloper, sendEmbedSnippet } from "@/app/business/ai-widget/store/ai-widget-slice";
import type { DeveloperContact } from "@/app/business/ai-widget/apis";
import { SendSnippetDialog } from "./send-snippet-dialog";

/** "today" / "3 days ago" — a sent date only has to answer "recently, or ages ago?". */
function sentAgo(iso: string | null): string {
  if (!iso) return "not sent yet";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "sent today";
  if (days === 1) return "sent yesterday";
  if (days < 30) return `sent ${days} days ago`;
  return `sent on ${new Date(iso).toLocaleDateString()}`;
}

function Recipient({ person }: Readonly<{ person: DeveloperContact }>) {
  const dispatch = useAppDispatch();
  const sending = useAppSelector((s) => s.aiWidget.sendStatus) === "loading";

  const [removing, setRemoving] = useState(false);

  const forget = async () => {
    setRemoving(true);
    try {
      await dispatch(forgetEmbedDeveloper(person.id)).unwrap();
    } catch (e) {
      toast.error("Couldn't remove that address", { description: typeof e === "string" ? e : "Please try again." });
    } finally {
      setRemoving(false);
    }
  };

  const resend = async () => {
    try {
      await dispatch(sendEmbedSnippet({ emails: [person.email] })).unwrap();
      toast.success("Code sent again", { description: `We emailed the code to ${person.email}.` });
    } catch (e) {
      toast.error("Couldn't send the code", { description: typeof e === "string" ? e : "Please try again." });
    }
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md bg-background/60 px-2.5 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm">{person.email}</p>
        <p className="truncate text-xs text-muted-foreground">
          {sentAgo(person.last_sent_at)}
          {person.send_count > 1 && ` · ${person.send_count} times`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={resend} disabled={sending} className="cursor-pointer">
          <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Send again
        </Button>
        {/* Removes the record only — nothing was ever provisioned for them, so there is no access
            to revoke and no confirmation step to justify. */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={forget}
          disabled={removing}
          className="cursor-pointer text-muted-foreground hover:text-destructive"
          aria-label={`Remove ${person.email} from the list`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </li>
  );
}

/**
 * Who has been sent the widget code.
 *
 * These people are agencies, contractors and colleagues — NOT staff. An earlier version invited
 * them into the org as a `developer` agent so they could sign in, which put non-staff in the
 * institution's user list and mailed them an invitation to join GlobalyApp they never asked for.
 * The record is now just an address and when the code last went to it (`ai_embed_developers`).
 */
export function EmbedDeveloperHandoff({ developers }: Readonly<{ developers: DeveloperContact[] }>) {
  const [mailOpen, setMailOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Please send this to the people who look after your website.</p>
          <p className="text-sm text-muted-foreground">
            They get the line, where it goes on each platform, and a way to check it worked. No account
            needed, and they never see student enquiries.
          </p>
        </div>
        <Button size="sm" onClick={() => setMailOpen(true)} className="shrink-0 cursor-pointer">
          <Mail className="mr-1.5 h-4 w-4" aria-hidden />
          {developers.length ? "Send to someone else" : "Email the script"}
        </Button>
      </div>

      {developers.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {developers.map((person) => <Recipient key={person.id} person={person} />)}
        </ul>
      )}

      <SendSnippetDialog open={mailOpen} onOpenChange={setMailOpen} />
    </div>
  );
}
