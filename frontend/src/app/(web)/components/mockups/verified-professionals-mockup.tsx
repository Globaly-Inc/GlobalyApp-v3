import { BadgeCheck, Star, MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MockupCard, MockupFrame } from "./mockup-frame";

const pros = [
  { name: "Priya Sharma", role: "Senior Education Counselor", city: "Sydney, AU", rating: 4.9, trust: 96, initials: "PS" },
  { name: "Daniel Okoye", role: "Visa & Admissions Expert", city: "Toronto, CA", rating: 4.8, trust: 93, initials: "DO" },
  { name: "Mei Tanaka", role: "STEM Programs Advisor", city: "London, UK", rating: 4.9, trust: 95, initials: "MT" },
];

export function VerifiedProfessionalsMockup() {
  return (
    <MockupFrame label="globaly.app / professionals">
      <div className="space-y-2">
        {pros.map((p, i) => (
          <MockupCard
            key={p.name}
            className="p-3 flex items-center gap-3 hover:shadow-md transition-shadow animate-fade-in"
            style={{ animationDelay: `${i * 130}ms`, animationFillMode: "both" }}
          >
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{p.initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold text-foreground truncate">{p.name}</span>
                <BadgeCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              </div>
              <div className="text-xs text-muted-foreground truncate">{p.role}</div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                <span className="flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {p.rating}
                </span>
                <span>·</span>
                <span>Trust {p.trust}</span>
                <span>·</span>
                <span className="truncate">{p.city}</span>
              </div>
            </div>
            <div className="hidden sm:flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 flex-shrink-0">
              <MessageCircle className="h-4 w-4 text-primary" />
            </div>
          </MockupCard>
        ))}
      </div>
    </MockupFrame>
  );
}
