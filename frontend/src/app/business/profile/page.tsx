"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuthState } from "@/app/auth/store/auth-slice";

export default function BusinessProfileResolverPage() {
  const router = useRouter();
  const { user, initializing } = useAuthState();

  useEffect(() => {
    if (initializing || !user) return;
    const target = user.businesses.find((b) => b.org_id === user.orgId) ?? user.businesses[0];
    if (target) router.replace(`/business/profile/${target.id}`);
    else router.replace("/business/portal");
  }, [initializing, user, router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
