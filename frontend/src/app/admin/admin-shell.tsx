"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { logout, useAuthState } from "@/app/auth/store/auth-slice";
import { fetchMe } from "./store/admin-slice";
import { ROLE_DISPLAY } from "./consts";
import { getVisibleNavGroups, isNavPathActive } from "./nav-config";
import { AdminPortalSwitcher } from "./components/admin-portal-switcher";
import { PortalShell } from "@/components/portal-shell/portal-shell";
import { PortalLoadError, PortalLoading } from "@/components/portal-shell/portal-status";
import { SIGN_IN_HREF } from "@/app/auth/const";

export function AdminShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const { me, status, error } = useAppSelector((state) => state.admin);
  const { user: authUser, initializing } = useAuthState();
  const isAdmin = authUser?.is_admin === true;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (initializing || isAdmin) return;
    if (authUser) {
      router.replace("/");
      return;
    }
    const qs = searchParams.toString();
    router.replace(`${SIGN_IN_HREF}?redirect=${encodeURIComponent(qs ? `${pathname}?${qs}` : pathname)}`);
  }, [initializing, isAdmin, authUser, pathname, searchParams, router]);

  const fetchedMeRef = useRef(false);
  useEffect(() => {
    if (!isAdmin || fetchedMeRef.current) return;
    fetchedMeRef.current = true;
    dispatch(fetchMe());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);
  useEffect(() => {
    if (!isAdmin || authUser?.role !== "data_admin") return;
    if (!isNavPathActive(pathname, "/admin/overview")) return;
    const firstVisibleHref = getVisibleNavGroups(authUser.role)[0]?.items[0]?.href;
    if (firstVisibleHref) router.replace(firstVisibleHref);
  }, [isAdmin, authUser?.role, pathname, router]);

  const handleSignOut = () => {
    dispatch(logout());
    router.push(SIGN_IN_HREF);
  };

  if (initializing) return <PortalLoading />;

  if (!isAdmin) return null;

  if (mounted && status === "failed") {
    return <PortalLoadError message={error ?? "Failed to load admin profile."} onSignOut={handleSignOut} />;
  }

  if (!me) return <PortalLoading />;

  return (
    <PortalShell
      title="Super Admin"
      groups={getVisibleNavGroups(authUser.role)}
      context={
        <AdminPortalSwitcher
          roleLabel={ROLE_DISPLAY[me.role]}
          isSuperAdmin={me.role === "super_admin"}
          businesses={authUser.businesses}
          institutions={authUser.institutions}
          activeOrgId={authUser.orgId}
        />
      }
      account={{ name: me.name, email: me.email, photoUrl: me.photo_url, isAdmin: true }}
      onSignOut={handleSignOut}
      // Admin tables use the full content width.
      width="wide"
    >
      {children}
    </PortalShell>
  );
}
