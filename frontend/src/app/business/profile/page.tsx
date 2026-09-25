"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuthState } from "@/app/auth/store/auth-slice";

// Bare /business/profile has no business/institution id of its own — it exists only to figure
// out which one the caller means (their current org, or their first membership) and redirect to
// the real detail route (/business/profile/[businessId], BusinessProfileDetailView). It must
// never render the PERSONAL ProfileView: that component redirects non-personal-account users
// straight back to this same URL, which got a business/admin-only user stuck in a loop that
// never actually reached their business profile.
export default function BusinessProfilePage() {
  const router = useRouter();
  const { user, initializing } = useAuthState();

  const target = user
    ? (user.businesses.find((b) => b.org_id === user.orgId) ?? user.businesses[0]
        ?? user.institutions.find((i) => i.org_id === user.orgId) ?? user.institutions[0])
    : null;

  useEffect(() => {
    if (initializing || !user) return;
    router.replace(target ? `/business/profile/${target.id}` : "/business/portal");
  }, [initializing, user, target, router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}