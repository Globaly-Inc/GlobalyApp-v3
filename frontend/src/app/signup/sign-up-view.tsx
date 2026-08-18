"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchMe } from "@/app/auth/store/auth-slice";
import {
  registerAndSendOtp, requestBusinessClaim, resendOtp, verifySignUpOtp, resetSignupError, dismissClaimOffer,
} from "./store/signup-slice";
import { otpSchema, zodErrorsToFieldErrors, validateSignUpField, validateOtpField } from "./validation";
import { clearFieldErrorIfNowValid, validateSignUpDetails } from "./utils";
import { BusinessClaimOfferCard } from "./components/business-claim-offer-card";
import { RegistrationForm } from "./components/registration-form";
import { OtpVerifyForm } from "./components/otp-verify-form";

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
  const [claimRequestSent, setClaimRequestSent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [resendCooldown, setResendCooldown] = useState(0);

  const dispatch = useAppDispatch();
  const { status, claimOffer } = useAppSelector((state) => state.signup);
  const loading = status === "registering" || status === "sendingOtp" || status === "verifyingOtp";
  const claimRequestLoading = status === "requestingClaim";

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
      if (result.error.code !== "BUSINESS_CLAIM_AVAILABLE") {
        toast.error("Failed to send code", { description: result.error.message ?? "Please try again." });
      }
    }
  };

  const handleClaimYes = async () => {
    const result = await dispatch(requestBusinessClaim({ email }));
    if (requestBusinessClaim.fulfilled.match(result)) {
      setClaimRequestSent(true);
    } else {
      toast.error("Couldn't send claim link", { description: result.error.message ?? "Please try again." });
    }
  };

  const handleClaimNo = () => {
    dispatch(dismissClaimOffer());
    setEmail("");
    toast("Please use a different email to sign up.");
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
      } else if (me.user_category === "business") {
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

  const cardDescription = () => {
    if (claimOffer) return claimRequestSent ? `Check ${email} for a link to claim it.` : "You can claim it instead of creating a new account.";
    if (otpSent) return `Enter the 6-digit code sent to ${email}`;
    return "Start your global education journey today";
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
            <CardTitle className="text-2xl">{claimOffer ? "Business profile found" : "Create your account"}</CardTitle>
            <CardDescription>{cardDescription()}</CardDescription>
          </CardHeader>
          <CardContent>
            {claimOffer && (
              <BusinessClaimOfferCard
                message={claimOffer.message}
                claimRequestSent={claimRequestSent}
                loading={claimRequestLoading}
                onYes={handleClaimYes}
                onNo={handleClaimNo}
              />
            )}
            {!claimOffer && !otpSent && (
              <RegistrationForm
                firstName={firstName}
                lastName={lastName}
                email={email}
                fieldErrors={fieldErrors}
                loading={loading}
                onFirstNameChange={handleFirstNameChange}
                onLastNameChange={handleLastNameChange}
                onEmailChange={handleEmailChange}
                onSubmit={handleSendOtp}
                onGoogleSignUp={handleGoogleSignUp}
              />
            )}
            {!claimOffer && otpSent && (
              <OtpVerifyForm
                otpCode={otpCode}
                fieldErrors={fieldErrors}
                loading={loading}
                resendCooldown={resendCooldown}
                onOtpCodeChange={handleOtpCodeChange}
                onSubmit={handleVerifyOtp}
                onResend={handleResendOtp}
                onBack={resetFlow}
              />
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
