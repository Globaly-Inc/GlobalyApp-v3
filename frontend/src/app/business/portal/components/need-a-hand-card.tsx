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
          <p className="text-sm font-medium">Need a hand?</p>
          <p className="text-xs text-muted-foreground">Book a free 20-minute onboarding call with our team.</p>
          <a href="mailto:support@globalyapp.com" className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
            Book a call →
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
