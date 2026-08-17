import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "../../components/reveal";
import type { CityDetail } from "../types";

export function CityHighlights({ city }: Readonly<{ city: CityDetail }>) {
  if (city.highlights.length === 0) return null;

  return (
    <Reveal>
      <h2 className="mb-4 text-2xl font-bold">Highlights &amp; Attractions</h2>
      <div className="flex flex-wrap gap-2">
        {city.highlights.map((h) => (
          <Badge key={h} variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm">
            <Star className="h-3 w-3" /> {h}
          </Badge>
        ))}
      </div>
    </Reveal>
  );
}
