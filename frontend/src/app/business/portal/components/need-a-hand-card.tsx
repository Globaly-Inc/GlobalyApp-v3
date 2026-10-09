import { CircleHelp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function NeedAHandCard() {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/15 dark:text-emerald-400">
          <CircleHelp className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">Rather be walked through it?</p>
          <p className="text-xs text-muted-foreground">
            Book 20 minutes with our onboarding team — we&apos;ll set it up with you.
          </p>
          {/* A bordered control, as the boards draw it — the aside's one offer, not a buried link.
              A mailto, so it asks for a time rather than claiming to be a calendar. */}
          <a
            href="mailto:support@globalyapp.com"
            className="mt-2.5 inline-flex h-9 items-center rounded-lg border bg-background px-3.5 text-[13px] font-semibold transition-colors hover:bg-muted"
          >
            Ask for a time
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
