import { MapPin, Clock, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CountryDetail } from "../types";

export function CountryAbout({ country }: Readonly<{ country: CountryDetail }>) {
  if (!country.about) return null;

  return (
    <div className="max-w-3xl">
      <h2 className="mb-4 text-2xl font-bold">Why Study in {country.name}?</h2>
      <p className="text-lg leading-relaxed text-muted-foreground">{country.about}</p>
      {country.visa_type && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1.5">
            <MapPin className="h-3 w-3" /> {country.visa_type}
          </Badge>
          {country.visa_processing_time && (
            <Badge variant="outline" className="gap-1.5">
              <Clock className="h-3 w-3" /> {country.visa_processing_time}
            </Badge>
          )}
          {country.visa_fee && (
            <Badge variant="outline" className="gap-1.5">
              <DollarSign className="h-3 w-3" /> {country.visa_fee}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
