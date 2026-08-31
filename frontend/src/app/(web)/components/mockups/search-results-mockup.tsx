import { Search, MapPin, GraduationCap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MockupCard, MockupFrame } from "./mockup-frame";

const results = [
  { name: "University of Toronto", city: "Toronto, Canada", tag: "MSc Computer Science", fee: "USD 28,400 / yr" },
  { name: "TU Munich", city: "Munich, Germany", tag: "MSc Data Engineering", fee: "USD 1,200 / yr" },
  { name: "Monash University", city: "Melbourne, Australia", tag: "MSc AI & ML", fee: "USD 32,100 / yr" },
];

export function SearchResultsMockup() {
  return (
    <MockupFrame label="globaly.app / search">
      <div className="space-y-4">
        <div className="relative animate-fade-in" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input readOnly value="Masters in Computer Science" className="pl-9" />
        </div>

        <div className="space-y-2">
          {results.map((r, i) => (
            <MockupCard
              key={r.name}
              className="p-3 flex items-center gap-3 hover:shadow-md transition-shadow animate-fade-in"
              style={{ animationDelay: `${150 + i * 120}ms`, animationFillMode: "both" }}
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{r.name}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {r.city}
                </div>
              </div>
              <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0">
                <Badge variant="secondary" className="text-[10px]">
                  {r.tag}
                </Badge>
                <span className="text-xs text-muted-foreground">{r.fee}</span>
              </div>
            </MockupCard>
          ))}
        </div>
      </div>
    </MockupFrame>
  );
}
