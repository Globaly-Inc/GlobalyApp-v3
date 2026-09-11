import { GraduationCap, DollarSign, Briefcase } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "../../components/reveal";
import type { CountryDetail } from "../types";
import { amountLabel } from "@/lib/utils";

export function CountryLiving({ country }: Readonly<{ country: CountryDetail }>) {
  const hasTuition = country.avg_tuition_min != null || country.avg_tuition_max != null;
  if (!hasTuition && !country.cost_of_living_label && !country.work_rights_label) return null;

  const cards = [
    hasTuition && {
      icon: GraduationCap,
      label: "Average Tuition",
      value: `${amountLabel(
        country.avg_tuition_min ?? country.avg_tuition_max,
        country.avg_tuition_currency,
        country.avg_tuition_min != null ? country.avg_tuition_max : null,
      )}/yr`,
    },
    country.cost_of_living_label && { icon: DollarSign, label: "Cost of Living", value: country.cost_of_living_label },
    country.work_rights_label && { icon: Briefcase, label: "Work Rights", value: country.work_rights_label },
  ].filter((c): c is { icon: typeof GraduationCap; label: string; value: string } => !!c);

  return (
    <Reveal>
      <h2 className="mb-6 text-2xl font-bold">Living &amp; Studying</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="transition-shadow hover:shadow-md">
            <CardContent className="pt-5">
              <c.icon className="mb-3 h-8 w-8 text-primary" />
              <p className="text-lg font-bold">{c.value}</p>
              <p className="text-sm text-muted-foreground">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </Reveal>
  );
}
