import { Badge } from "@/components/ui/badge";
import { FACT_CHIP_CLASS } from "../../const";
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
          <div className="flex flex-wrap gap-2.5">
            {city.highlights.map((h) => (
              <Badge key={h} variant="outline" className={FACT_CHIP_CLASS}>
                {h}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
