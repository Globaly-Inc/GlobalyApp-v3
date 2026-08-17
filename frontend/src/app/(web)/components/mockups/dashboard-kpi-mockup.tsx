import { MockupFrame } from "./mockup-frame";
import { Card } from "@/components/ui/card";
import { TrendingUp, Users, MessageSquare, Wallet } from "lucide-react";

const kpis = [
  { label: "Enquiries", value: "1,284", delta: "+18%", icon: MessageSquare },
  { label: "Active leads", value: "342", delta: "+9%", icon: Users },
  { label: "Conversions", value: "57", delta: "+24%", icon: TrendingUp },
  { label: "Wallet", value: "12,400", delta: "coins", icon: Wallet },
];

// Bars grow via inline animation-delay; heights baked in.
const bars = [40, 65, 50, 80, 72, 90, 100];

export function DashboardKPIMockup() {
  return (
    <MockupFrame label="business portal / dashboard">
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {kpis.map((k, i) => (
            <Card key={k.label} className="p-3 animate-fade-in" style={{ animationDelay: `${i * 100}ms`, animationFillMode: "both" }}>
              <div className="flex items-center justify-between mb-1.5">
                <k.icon className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] text-primary font-medium">{k.delta}</span>
              </div>
              <div className="text-lg font-semibold text-foreground leading-none">{k.value}</div>
              <div className="text-[10px] text-muted-foreground mt-1 truncate">{k.label}</div>
            </Card>
          ))}
        </div>

        <Card className="p-4">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-xs font-medium text-foreground">Enquiries this week</span>
            <span className="text-[10px] text-muted-foreground">Mon – Sun</span>
          </div>
          <div className="flex items-end gap-2 h-24">
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-gradient-to-t from-primary/80 to-primary/40 origin-bottom animate-fade-in"
                style={{ height: `${h}%`, animationDelay: `${400 + i * 80}ms`, animationFillMode: "both" }}
              />
            ))}
          </div>
        </Card>
      </div>
    </MockupFrame>
  );
}
