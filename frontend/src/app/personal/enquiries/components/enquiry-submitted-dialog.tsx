import type { LucideIcon } from "lucide-react";
import { CircleCheck, Eye, Lock, Phone, PhoneOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Shown once an enquiry is accepted. Replaces a bare success toast, which cannot carry a privacy
 * notice — a toast is gone in four seconds and cannot be re-read, and this is the one moment the
 * student needs to understand what a business will be able to see about them.
 *
 * Three rows, ordered by how much of the student's privacy each costs: what is visible now, what
 * paying unlocks, and what depends on the choice they just made. The first two are facts; the
 * third is their decision, which is why only it carries colour — a wall of tinted rows would make
 * the one thing they control indistinguishable from the two they don't.
 */
/**
 * Hues borrowed from STATUS_STYLES rather than picked fresh, so a colour means the same thing here
 * as it does on the status pills two inches away:
 *   blue    — `distributed`: out with matched institutions and agents already
 *   amber   — `pending`: conditional, waiting on something (here, on someone paying)
 *   emerald — `unlocked`: granted
 * Private stays muted: nothing was granted, so no hue is the honest answer.
 */
const TONE = {
  visible: "border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300",
  gated: "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
  shared:
    "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  private: "border-border bg-muted text-muted-foreground",
} as const;

export function EnquirySubmittedDialog({
  open,
  onOpenChange,
  sharedContact,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sharedContact: boolean;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-emerald-500/10">
            <CircleCheck className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
          </div>
          <DialogTitle>Enquiry sent</DialogTitle>
          <DialogDescription>
            We&apos;re matching it to institutions and agents who represent this course. Here&apos;s
            what they can see about you.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <VisibilityRow
            icon={Eye}
            badge="Visible now"
            tone={TONE.visible}
            title="Your name and what you asked about"
            body="The course, your preferred intake, and your name — so they can tell your enquiry apart from anyone else's."
          />

          <VisibilityRow
            icon={Lock}
            badge="After unlock"
            tone={TONE.gated}
            title="The profile attached to this enquiry"
            body="A business that spends credits to unlock it can see your education history, test scores and email address."
          />

          <VisibilityRow
            icon={sharedContact ? Phone : PhoneOff}
            badge={sharedContact ? "You agreed" : "Kept private"}
            title="Your phone number"
            body={
              sharedContact
                ? "You agreed to share it, so a business that unlocks this enquiry can call you."
                : "You chose not to share it. It stays hidden even from a business that unlocks this enquiry."
            }
            tone={sharedContact ? TONE.shared : TONE.private}
          />
        </div>

        <DialogFooter>
          <Button className="w-full sm:w-auto" render={<DialogClose />}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * `tone` colours the icon chip and the badge together, so the row reads as one unit rather than a
 * grey box with a coloured sticker. Undefined means neutral, which is the default for a row
 * stating a fact rather than reflecting a choice.
 */
function VisibilityRow({
  icon: Icon,
  badge,
  title,
  body,
  tone,
}: Readonly<{
  icon: LucideIcon;
  badge: string;
  title: string;
  body: string;
  tone?: string;
}>) {
  const neutral = "border-border bg-muted text-muted-foreground";
  return (
    // Every row is a card. The phone row used to be the only one, which read as "this one matters
    // and the other two are footnotes" — but all three describe data leaving the student's hands.
    // Only the icon chip and badge stay colour-coded, so the consent row is still the one that
    // reflects a choice rather than a fact.
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg border", tone ?? neutral)}>
        <Icon className="size-4" aria-hidden />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <Badge variant="outline" className={cn("shrink-0 text-[11px]", tone)}>
            {badge}
          </Badge>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
