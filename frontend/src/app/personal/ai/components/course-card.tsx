"use client";

import { ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CourseCard as CourseCardType } from "../apis/types";

type CourseCardProps = {
  card: CourseCardType;
};

function formatFee(amount: number | null, currency: string): string {
  if (amount == null) return "Fee not listed";
  return `${currency} ${amount.toLocaleString()}/yr`;
}

export function CourseCard({ card }: CourseCardProps) {
  return (
    <Card size="sm" className="max-w-sm">
      <CardContent className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{card.institution_name}</p>
        <p className="font-medium leading-snug">{card.course_name}</p>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{card.degree_level}</Badge>
          <Badge variant="outline">{card.country}</Badge>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{card.duration}</span>
          <span>{formatFee(card.annual_tuition_fee, card.currency)}</span>
        </div>
        {card.intakes.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Intakes: {card.intakes.join(", ")}
          </p>
        )}
        {card.study_modes.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {card.study_modes.join(" · ")}
          </p>
        )}
        {card.source_url && (
          <Button variant="link" size="sm" className="w-fit p-0" render={<a href={card.source_url} target="_blank" rel="noopener noreferrer" />}>
            View Details <ExternalLink />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
