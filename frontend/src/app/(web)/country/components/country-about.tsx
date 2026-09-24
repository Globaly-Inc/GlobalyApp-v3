import { MapPin, Clock, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "../../components/reveal";
import { FACT_CHIP_CLASS } from "../../const";
import type { CountryDetail } from "../types";

export function CountryAbout({ country }: Readonly<{ country: CountryDetail }>) {
  if (!country.about) return null;

  const chips = [
    { icon: MapPin, text: `Visa: ${country.visa_type}` },
    country.visa_processing_time && { icon: Clock, text: country.visa_processing_time },
    country.visa_fee && { icon: DollarSign, text: country.visa_fee },
  ].filter((c): c is { icon: typeof MapPin; text: string } => !!c);

  return (
    <Reveal className="max-w-3xl">
      <h2 className="mb-4 text-2xl font-bold">Why Study in {country.name}?</h2>
      <p className="text-lg leading-relaxed text-muted-foreground">{country.about}</p>
      {country.visa_type && (
        <div className="mt-5 flex flex-wrap gap-2.5">
          {chips.map((c) => (
            <Badge key={c.text} variant="outline" className={FACT_CHIP_CLASS}>
              <c.icon /> {c.text}
            </Badge>
          ))}
        </div>
      )}
    </Reveal>
  );
}
