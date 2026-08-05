"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  sendSignInOtp,
  resendSignInOtp,
  verifySignInOtp,
  resetSignInError,
  setSelectedCategory,
  toPortalCategory,
} from "./store/auth-slice";
import { fetchMyProfile } from "@/app/personal/store/personal-onboarding-slice";

const emailSchema = z.string().trim().max(255).pipe(z.email("Invalid email address"));
const otpSchema = z.string().trim().length(6, "Please enter the 6-digit code").regex(/^\d+$/, "Code must be numeric");

const CATEGORY_ROUTES: Record<"personal" | "business", string> = {
  personal: "/personal/onboarding",
  business: "/business/onboarding",
};

function formatCooldown(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
}

export function SignInView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect");
  const redirectQuery = redirectPath ? `?redirect=${encodeURIComponent(redirectPath)}` : "";
  const signUpHref = `/auth/sign-up${redirectQuery}`;

  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [otpFieldError, setOtpFieldError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const dispatch = useAppDispatch();
  const { status } = useAppSelector((state) => state.auth);
  const loading = status === "sendingOtp" || status === "verifyingOtp";

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (fieldError && emailSchema.safeParse(value).success) setFieldError(null);
  };

  const handleOtpCodeChange = (value: string) => {
    setOtpCode(value);
    if (otpFieldError && otpSchema.safeParse(value).success) setOtpFieldError(null);
  };

  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message ?? "Invalid email address");
      return;
    }
    setFieldError(null);
    const outcome = await dispatch(sendSignInOtp({ email: result.data }));
    if (sendSignInOtp.fulfilled.match(outcome)) {
      setOtpSent(true);
      setResendCooldown(60);
      setOtpCode("");
      toast.success("Code sent!", { description: "Check your email for the 6-digit code." });
    } else if (sendSignInOtp.rejected.match(outcome)) {
      toast.error("Failed to send code", { description: outcome.error.message ?? "Please try again." });
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    const outcome = await dispatch(resendSignInOtp({ email }));
    if (resendSignInOtp.fulfilled.match(outcome)) {
      setResendCooldown(60);
      setOtpCode("");
      toast.success("Code sent!", { description: "Check your email for the 6-digit code." });
    } else if (resendSignInOtp.rejected.match(outcome)) {
      toast.error("Failed to send code", { description: outcome.error.message ?? "Please try again." });
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    const result = otpSchema.safeParse(otpCode);
    if (!result.success) {
      setOtpFieldError(result.error.issues[0]?.message ?? "Invalid code");
      return;
    }
    setOtpFieldError(null);
    const outcome = await dispatch(verifySignInOtp({ email, otp: otpCode }));
    if (verifySignInOtp.fulfilled.match(outcome)) {
      toast.success("Welcome back!", { description: "You have been signed in." });
      if (redirectPath) {
        router.push(redirectPath);
        return;
      }
      const profileOutcome = await dispatch(fetchMyProfile());
      const category = fetchMyProfile.fulfilled.match(profileOutcome)
        ? toPortalCategory(profileOutcome.payload.individual_category)
        : null;
      dispatch(setSelectedCategory(category));
      router.push(category ? CATEGORY_ROUTES[category] : "/auth/role-select");
    } else if (verifySignInOtp.rejected.match(outcome)) {
      toast.error("Verification failed", { description: outcome.error.message ?? "Please try again." });
    }
  };

  const resetFlow = () => {
    setOtpSent(false);
    setOtpCode("");
    setOtpFieldError(null);
    setResendCooldown(0);
    dispatch(resetSignInError());
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/">
            <Image src="/globaly-logo.png" alt="Globaly.io" width={753} height={157} className="h-10 w-auto" />
          </Link>
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>
              {otpSent ? `Enter the 6-digit code sent to ${email}` : "Sign in with a 6-digit code sent to your email"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!otpSent && (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="flex justify-center mb-2">
                  <Mail className="h-10 w-10 text-primary" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    className="h-10"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    aria-invalid={!!fieldError}
                    autoFocus
                    required
                  />
                  {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
                </div>
                <Button type="submit" className="h-10 w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending code…
                    </>
                  ) : (
                    "Send Verification Code"
                  )}
                </Button>
                <p className="text-center text-sm text-muted-foreground pt-2">
                  Don&apos;t have an account?{" "}
                  <Link href={signUpHref} className="text-primary font-medium hover:underline">
                    Sign up
                  </Link>
                </p>
              </form>
            )}

            {otpSent && (
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div className="flex justify-center mb-1">
                  <Mail className="h-10 w-10 text-primary" />
                </div>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otpCode} onChange={handleOtpCodeChange}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} aria-invalid={!!otpFieldError} />
                      <InputOTPSlot index={1} aria-invalid={!!otpFieldError} />
                      <InputOTPSlot index={2} aria-invalid={!!otpFieldError} />
                      <InputOTPSlot index={3} aria-invalid={!!otpFieldError} />
                      <InputOTPSlot index={4} aria-invalid={!!otpFieldError} />
                      <InputOTPSlot index={5} aria-invalid={!!otpFieldError} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {otpFieldError && <p className="text-sm text-destructive text-center">{otpFieldError}</p>}
                <Button type="submit" className="h-10 w-full" disabled={loading || otpCode.length !== 6}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying…
                    </>
                  ) : (
                    "Verify & Sign In"
                  )}
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 flex-1"
                    onClick={handleResendOtp}
                    disabled={loading || resendCooldown > 0}
                  >
                    {resendCooldown > 0 ? `Resend in ${formatCooldown(resendCooldown)}` : "Resend Code"}
                  </Button>
                  <Button type="button" variant="ghost" className="h-10 flex-1" onClick={resetFlow}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
