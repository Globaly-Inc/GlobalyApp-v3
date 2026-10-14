"use client";

import Link from "next/link";
import { CheckCircle2, ArrowRight, Circle } from "lucide-react";
import { useAppSelector } from "@/lib/hooks";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export function ProfileCompletionCard() {
  const completion = useAppSelector((state) => state.profile.profile?.completion);
  if (!completion || completion.percentage >= 100) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complete your profile</CardTitle>
        <CardAction>
          <span className="text-sm font-semibold tabular-nums text-foreground">{completion.percentage}%</span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Progress value={completion.percentage} aria-label="Profile completion" />
        <ul className="flex flex-col gap-2.5">
          {completion.items.map((item) => (
            <li key={item.label} className="flex items-center gap-2.5 text-sm">
              {item.met ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
              )}
              <span className={item.met ? "text-muted-foreground line-through" : "text-foreground"}>{item.label}</span>
              <span className="sr-only">{item.met ? "(done)" : "(to do)"}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button className="w-full gap-2" render={<Link href="/personal/profile" />}>
          Complete profile
          <ArrowRight className="size-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
