import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CityDetail } from "../types";

export function CityAbout({ city }: Readonly<{ city: CityDetail }>) {
  if (!city.about && city.highlights.length === 0) return null;

  return (
    <div className="max-w-3xl space-y-8">
      {city.about && (
        <div>
          <h2 className="mb-4 text-2xl font-bold">About {city.name}</h2>
          <p className="text-lg leading-relaxed text-muted-foreground">{city.about}</p>
        </div>
      )}
      {city.highlights.length > 0 && (
        <div>
          <h2 className="mb-4 text-2xl font-bold">Highlights &amp; Attractions</h2>
          <div className="flex flex-wrap gap-2">
            {city.highlights.map((h) => (
              <Badge key={h} variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm">
                <Star className="h-3 w-3" />{h}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
