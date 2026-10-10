import { Card, CardContent } from "@/components/ui/card";

export function NeedAHandCard() {
  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/rail/help.webp" alt="" aria-hidden className="size-10 shrink-0 object-contain" />
        <div className="min-w-0">
          <p className="font-heading text-base font-medium">Rather be walked through it?</p>
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
