import { redirect } from "next/navigation";
import { SignUpView } from "@/app/signup/sign-up-view";
import { SIGN_UP_ENABLED } from "@/app/auth/const";

export default function SignUpPage() {
  if (!SIGN_UP_ENABLED) redirect("/");
  return <SignUpView />;
}
