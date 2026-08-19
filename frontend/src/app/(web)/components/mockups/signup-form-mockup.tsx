import { Mail, User, Lock, CheckCircle2 } from "lucide-react";
import { MockupButton, MockupFrame, MockupInput } from "./mockup-frame";

const FIELDS = [
  { label: "Full name", value: "Aanya Sharma", type: "text", Icon: User, delay: 150 },
  { label: "Email", value: "aanya@example.com", type: "text", Icon: Mail, delay: 300 },
  { label: "Password", value: "••••••••••", type: "password", Icon: Lock, delay: 450 },
] as const;

/** Staggered signup form — pure CSS animations, no JS state needed. */
export function SignupFormMockup() {
  return (
    <MockupFrame label="globaly.app / sign up">
      <div className="space-y-4">
        <div className="space-y-1 animate-fade-in" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
          <h3 className="text-lg font-semibold text-foreground">Create your account</h3>
          <p className="text-sm text-muted-foreground">Start your study journey in 60 seconds.</p>
        </div>

        <div className="space-y-3">
          {FIELDS.map((f) => (
            <div key={f.label} className="animate-fade-in" style={{ animationDelay: `${f.delay}ms`, animationFillMode: "both" }}>
              {/* V1 used <Label>: an INLINE element, so the line box it sits in is the parent's 24px strut,
                  not the 12px its own `text-xs leading-none` would suggest. Keep it inline or each field
                  loses 12px. */}
              <span className="text-xs font-medium leading-none text-muted-foreground">{f.label}</span>
              <div className="relative mt-1">
                <f.Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                <MockupInput type={f.type} value={f.value} className="pl-9" />
              </div>
            </div>
          ))}
        </div>

        <div className="animate-fade-in" style={{ animationDelay: "600ms", animationFillMode: "both" }}>
          <MockupButton size="lg" className="w-full">
            Create free account
          </MockupButton>
        </div>

        <div
          className="flex items-center gap-2 text-xs text-muted-foreground animate-fade-in"
          style={{ animationDelay: "750ms", animationFillMode: "both" }}
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          No credit card required · Free forever
        </div>
      </div>
    </MockupFrame>
  );
}
