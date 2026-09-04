import { GraduationCap, DollarSign, Briefcase } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "../../components/reveal";
import type { CountryDetail } from "../types";
import { amountLabel } from "@/lib/utils";

export function CountryLiving({ country }: Readonly<{ country: CountryDetail }>) {
  const hasTuition = country.avg_tuition_min != null || country.avg_tuition_max != null;
  if (!hasTuition && !country.cost_of_living_label && !country.work_rights_label) return null;

  return (
    <Reveal>
      <h2 className="mb-4 text-2xl font-bold">Living &amp; Studying</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {hasTuition && (
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="pt-6">
              <GraduationCap className="mb-3 h-8 w-8 text-primary" />
              <p className="text-lg font-semibold mt-1">
                {amountLabel(
                  country.avg_tuition_min ?? country.avg_tuition_max,
                  country.avg_tuition_currency,
                  country.avg_tuition_min != null ? country.avg_tuition_max : null,
                )}
                /yr
              </p>
              <p className="text-sm text-muted-foreground">Average Tuition</p>
            </CardContent>
          </Card>
        )}
        {country.cost_of_living_label && (
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="pt-6">
              <DollarSign className="mb-3 h-8 w-8 text-primary" />
              <p className="mt-1 font-semibold text-lg">{country.cost_of_living_label}</p>
              <p className="text-sm text-muted-foreground">Cost of Living</p>
            </CardContent>
          </Card>
        )}
        {country.work_rights_label && (
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="pt-6">
              <Briefcase className="mb-3 h-8 w-8 text-primary" />
              <p className="mt-1 font-semibold text-lg">{country.work_rights_label}</p>
              <p className="text-muted-foreground mt-1">Work Rights</p>
            </CardContent>
          </Card>
        )}
      </div>
    </Reveal>
  );
}
