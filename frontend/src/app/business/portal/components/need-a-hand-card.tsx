import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function NeedAHandCard() {
  return (
    <Card className="bg-accent-light">
      <CardContent className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/rail/help.webp" alt="" aria-hidden className="size-10 shrink-0 object-contain" />
        <div className="min-w-0">
          <p className="font-heading text-base font-medium tracking-[-0.02em]">Rather be walked through it?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Book 20 minutes with our onboarding team — we&apos;ll set it up with you.
          </p>
          {/* A bordered control, as the boards draw it — the aside's one offer, not a buried link.
              A mailto, so it asks for a time rather than claiming to be a calendar. */}
          <Button variant="outline" size="sm" className="mt-2.5 bg-card" render={<a href="mailto:support@globalyai.com" />}>
            Ask for a time
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
