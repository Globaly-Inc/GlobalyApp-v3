"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Separator } from "@/components/ui/separator";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchMe } from "@/app/auth/store/auth-slice";
import { registerAndSendOtp, resendOtp, verifySignUpOtp, resetSignupError } from "./store/signup-slice";
import { otpSchema, zodErrorsToFieldErrors, validateSignUpField, validateOtpField } from "./validation";
import { formatCooldown, clearFieldErrorIfNowValid, validateSignUpDetails } from "./utils";

export function SignUpView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect");
  const prefillEmail = searchParams.get("email");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(prefillEmail ?? "");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [resendCooldown, setResendCooldown] = useState(0);

  const dispatch = useAppDispatch();
  const { status } = useAppSelector((state) => state.signup);
  const loading = status === "registering" || status === "sendingOtp" || status === "verifyingOtp";

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleFirstNameChange = (value: string) => {
    setFirstName(value);
    clearFieldErrorIfNowValid(setFieldErrors, "firstName", validateSignUpField("firstName", value) === null);
  };
  const handleLastNameChange = (value: string) => {
    setLastName(value);
    clearFieldErrorIfNowValid(setFieldErrors, "lastName", validateSignUpField("lastName", value) === null);
  };
  const handleEmailChange = (value: string) => {
    setEmail(value);
    clearFieldErrorIfNowValid(setFieldErrors, "email", validateSignUpField("email", value) === null);
  };
  const handleOtpCodeChange = (value: string) => {
    setOtpCode(value);
    clearFieldErrorIfNowValid(setFieldErrors, "otpCode", validateOtpField(value) === null);
  };

  const validate = () => {
    const errors = validateSignUpDetails({ firstName, lastName, email });
    setFieldErrors(errors ?? {});
    return errors === null;
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const result = await dispatch(registerAndSendOtp({ firstName, lastName, email }));
    if (registerAndSendOtp.fulfilled.match(result)) {
      setOtpSent(true);
      setResendCooldown(60);
      setOtpCode("");
      toast.success("Code sent!", { description: "Check your email for the 6-digit code." });
    } else if (registerAndSendOtp.rejected.match(result)) {
      toast.error("Failed to send code", { description: result.error.message ?? "Please try again." });
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    const result = await dispatch(resendOtp({ email }));
    if (resendOtp.fulfilled.match(result)) {
      setResendCooldown(60);
      setOtpCode("");
      toast.success("Code sent!", { description: "Check your email for the 6-digit code." });
    } else if (resendOtp.rejected.match(result)) {
      toast.error("Failed to send code", { description: result.error.message ?? "Please try again." });
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpResult = otpSchema.safeParse({ otpCode });
    if (!otpResult.success) {
      setFieldErrors(zodErrorsToFieldErrors(otpResult.error));
      return;
    }
    setFieldErrors({});
    const result = await dispatch(verifySignUpOtp({ email, otp: otpCode }));
    if (verifySignUpOtp.fulfilled.match(result)) {
      toast.success("Welcome!", { description: "Your account has been created." });

      const meResult = await dispatch(fetchMe());
      const me = fetchMe.fulfilled.match(meResult) ? meResult.payload : null;
      if (!me) {
        router.push("/");
        return;
      }
      if (me.type === "admin") {
        router.push("/admin/overview");
      } else if (me.role === "business") {
        router.push("/business/profile");
      } else {
        router.push("/personal/profile");
      }
    } else if (verifySignUpOtp.rejected.match(result)) {
      toast.error("Verification failed", { description: result.error.message ?? "Please try again." });
    }
  };

  const handleGoogleSignUp = () => {
    toast("Coming soon", { description: "Google sign-up isn't available yet." });
  };

  const resetFlow = () => {
    setOtpSent(false);
    setOtpCode("");
    setFieldErrors({});
    setResendCooldown(0);
    dispatch(resetSignupError());
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/">
            <Image src="/globaly-logo.png" alt="Globaly.io" width={753} height={157} className="h-10 w-auto" />
          </Link>
        </div>
        <Card className="[--card-spacing:--spacing(6)]">
          <CardHeader className="gap-1.5 text-center">
            <CardTitle className="text-2xl">Create your account</CardTitle>
            <CardDescription>
              {otpSent ? `Enter the 6-digit code sent to ${email}` : "Start your global education journey today"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!otpSent && (
              <>
                <Button variant="outline" className="w-full h-10 gap-2 px-4 py-2 mb-4 cursor-pointer" onClick={handleGoogleSignUp}>
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continue with Google
                </Button>
                <div className="relative mb-4">
                  <Separator />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">or</span>
                </div>
              </>
            )}
            {!otpSent && (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                      id="firstName"
                      className="h-10"
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => handleFirstNameChange(e.target.value)}
                      aria-invalid={!!fieldErrors.firstName}
                      required
                    />
                    {fieldErrors.firstName && <p className="text-sm text-destructive">{fieldErrors.firstName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      className="h-10"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => handleLastNameChange(e.target.value)}
                      aria-invalid={!!fieldErrors.lastName}
                      required
                    />
                    {fieldErrors.lastName && <p className="text-sm text-destructive">{fieldErrors.lastName}</p>}
                  </div>
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
                    aria-invalid={!!fieldErrors.email}
                    required
                  />
                  {fieldErrors.email && <p className="text-sm text-destructive">{fieldErrors.email}</p>}
                </div>
                <Button type="submit" className="h-10 w-full cursor-pointer" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending code…
                    </>
                  ) : (
                    "Send Verification Code"
                  )}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  By creating an account, you agree to our{" "}
                  <Link href="/terms" className="text-primary hover:underline">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="text-primary hover:underline">
                    Privacy Policy
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
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 flex-1 cursor-pointer"
                    onClick={handleResendOtp}
                    disabled={loading || resendCooldown > 0}
                  >
                    {resendCooldown > 0 ? `Resend in ${formatCooldown(resendCooldown)}` : "Resend Code"}
                  </Button>
                  <Button type="button" variant="ghost" className="h-10 flex-1 cursor-pointer" onClick={resetFlow}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                </div>
              </form>
            )}

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href={redirectPath ? `/auth/sign-in?redirect=${encodeURIComponent(redirectPath)}` : "/auth/sign-in"}
                className="text-primary font-medium hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
