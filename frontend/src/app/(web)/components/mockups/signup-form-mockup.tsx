import { Mail, User, Lock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MockupFrame } from "./mockup-frame";

/** Staggered signup form — pure CSS animations, no JS state needed. */
export function SignupFormMockup() {
  return (
    <MockupFrame label="globalyapp.com / sign up">
      <div className="space-y-4">
        <div className="space-y-1 animate-fade-in" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
          <h3 className="text-lg font-semibold text-foreground">Create your account</h3>
          <p className="text-sm text-muted-foreground">Start your study journey in 60 seconds.</p>
        </div>

        <div className="space-y-3">
          <div className="animate-fade-in" style={{ animationDelay: "150ms", animationFillMode: "both" }}>
            <Label className="text-xs text-muted-foreground">Full name</Label>
            <div className="relative mt-1">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input readOnly value="Aanya Sharma" className="pl-9" />
            </div>
          </div>

          <div className="animate-fade-in" style={{ animationDelay: "300ms", animationFillMode: "both" }}>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input readOnly value="aanya@example.com" className="pl-9" />
            </div>
          </div>

          <div className="animate-fade-in" style={{ animationDelay: "450ms", animationFillMode: "both" }}>
            <Label className="text-xs text-muted-foreground">Password</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input readOnly type="password" value="••••••••••" className="pl-9" />
            </div>
          </div>
        </div>

        <div className="animate-fade-in" style={{ animationDelay: "600ms", animationFillMode: "both" }}>
          <Button className="w-full h-11 px-8" size="lg">
            Create free account
          </Button>
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
