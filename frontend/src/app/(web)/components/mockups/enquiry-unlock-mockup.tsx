import { Lock, Unlock, Coins, Mail, Phone } from "lucide-react";
import { MockupBadge, MockupButton, MockupCard, MockupFrame } from "./mockup-frame";

/** Two states stacked: the locked card fades out, the unlocked card fades in over the same space. */
export function EnquiryUnlockMockup() {
  return (
    <MockupFrame label="business portal / enquiries">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">New student enquiry</h3>
          <MockupBadge variant="secondary" className="gap-1">
            <Coins className="h-3 w-3 text-primary" /> 250 coins
          </MockupBadge>
        </div>

        <div className="relative">
          <MockupCard
            className="p-4 space-y-2 animate-fade-out"
            style={{ animationDelay: "800ms", animationFillMode: "both", animationDuration: "400ms" }}
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Lock className="h-4 w-4" />
              <span className="text-sm font-medium">Contact details locked</span>
            </div>
            <div className="space-y-1.5">
              <div className="h-3 w-2/3 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
            <MockupButton size="sm" className="w-full mt-2 gap-1.5">
              <Coins className="h-3.5 w-3.5" /> Unlock for 50 coins
            </MockupButton>
          </MockupCard>

          <MockupCard
            className="p-4 space-y-2 absolute inset-0 animate-fade-in border-primary/30"
            style={{ animationDelay: "1200ms", animationFillMode: "both" }}
          >
            <div className="flex items-center gap-2 text-primary">
              <Unlock className="h-4 w-4" />
              <span className="text-sm font-semibold">Unlocked · Aanya S.</span>
            </div>
            <div className="space-y-1.5 text-xs text-foreground">
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" /> aanya@example.com
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" /> +91 98••• ••432
              </div>
            </div>
            <MockupBadge className="bg-primary/10 text-primary border-0 text-[10px]">
              Interested in MSc CS · Canada
            </MockupBadge>
          </MockupCard>
        </div>
      </div>
    </MockupFrame>
  );
}
