import { CheckCircle2, Circle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MockupBar, MockupFrame } from "./mockup-frame";

const steps = [
  { label: "Basic information", done: true },
  { label: "Academic background", done: true },
  { label: "Test scores (IELTS / GRE)", done: true },
  { label: "Study preferences", done: true },
  { label: "Documents uploaded", done: false },
];

export function ProfileBuilderMockup() {
  return (
    <MockupFrame label="personal portal / profile">
      <div className="space-y-4">
        <div className="flex items-center gap-3 animate-fade-in" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
          <Avatar className="h-12 w-12 border-2 border-primary/20">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">AS</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground">Aanya Sharma</div>
            <div className="text-xs text-muted-foreground">Prospective student · India</div>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            80%
          </Badge>
        </div>

        <div className="space-y-1.5 animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Profile completion</span>
            <span className="font-medium text-foreground">4 / 5 steps</span>
          </div>
          <MockupBar value={80} />
        </div>

        <ul className="space-y-1.5">
          {steps.map((s, i) => (
            <li
              key={s.label}
              className="flex items-center gap-2 text-xs animate-fade-in"
              style={{ animationDelay: `${350 + i * 100}ms`, animationFillMode: "both" }}
            >
              {s.done ? (
                <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className={s.done ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </MockupFrame>
  );
}
