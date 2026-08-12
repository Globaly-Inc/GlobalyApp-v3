"use client";

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { useAuthState } from "./store/auth-slice";
import { fetchFullProfile } from "@/app/personal/store/profile-slice";
import { RoleSelectModal } from "./role-select-modal";

const ROLE_MODAL_DELAY_MS = 30_000;

export function RoleSelectGate() {
  const dispatch = useAppDispatch();
  const { user, initializing } = useAuthState();
  const { profile, status } = useAppSelector((state) => state.profile);
  const [open, setOpen] = useState(false);

  const shouldTrack = !initializing && user?.type === "platform_user";

  useEffect(() => {
    if (!shouldTrack) return;
    if (status === "idle" && !profile) dispatch(fetchFullProfile());
  }, [shouldTrack, status, profile, dispatch]);

  useEffect(() => {
    if (!shouldTrack || !profile || profile.user_category) return;
    const timer = setTimeout(() => setOpen(true), ROLE_MODAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [shouldTrack, profile]);

  if (!shouldTrack) return null;
  return <RoleSelectModal open={open} onOpenChange={setOpen} />;
}
