import { Card, CardContent } from "@/components/ui/card";

export function NeedAHandCard() {
  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/rail/help.webp" alt="" aria-hidden className="size-10 shrink-0 object-contain" />
        <div className="min-w-0">
          <p className="font-heading text-base font-medium">Need a hand?</p>
          <p className="text-xs text-muted-foreground">Book a free 20-minute onboarding call with our team.</p>
          <a href="mailto:support@globalyapp.com" className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
            Book a call →
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
