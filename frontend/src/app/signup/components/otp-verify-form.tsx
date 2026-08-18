import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { formatCooldown } from "../utils";

export function OtpVerifyForm({
  otpCode,
  fieldErrors,
  loading,
  resendCooldown,
  onOtpCodeChange,
  onSubmit,
  onResend,
  onBack,
}: Readonly<{
  otpCode: string;
  fieldErrors: Record<string, string>;
  loading: boolean;
  resendCooldown: number;
  onOtpCodeChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onResend: () => void;
  onBack: () => void;
}>) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex justify-center mb-1">
        <Mail className="h-10 w-10 text-primary" />
      </div>
      <div className="flex justify-center">
        <InputOTP maxLength={6} value={otpCode} onChange={onOtpCodeChange}>
          <InputOTPGroup>
            <InputOTPSlot index={0} aria-invalid={!!fieldErrors.otpCode} />
            <InputOTPSlot index={1} aria-invalid={!!fieldErrors.otpCode} />
            <InputOTPSlot index={2} aria-invalid={!!fieldErrors.otpCode} />
            <InputOTPSlot index={3} aria-invalid={!!fieldErrors.otpCode} />
            <InputOTPSlot index={4} aria-invalid={!!fieldErrors.otpCode} />
            <InputOTPSlot index={5} aria-invalid={!!fieldErrors.otpCode} />
          </InputOTPGroup>
        </InputOTP>
      </div>
      {fieldErrors.otpCode && <p className="text-sm text-destructive text-center">{fieldErrors.otpCode}</p>}
      <Button type="submit" className="h-10 w-full cursor-pointer" disabled={loading || otpCode.length !== 6}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Verifying…
          </>
        ) : (
          "Verify & Create Account"
        )}
      </Button>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-10 flex-1 cursor-pointer" onClick={onResend} disabled={loading || resendCooldown > 0}>
          {resendCooldown > 0 ? `Resend in ${formatCooldown(resendCooldown)}` : "Resend Code"}
        </Button>
        <Button type="button" variant="ghost" className="h-10 flex-1 cursor-pointer" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>
    </form>
  );
}
