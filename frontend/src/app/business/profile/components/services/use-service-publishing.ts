"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { updateService } from "../../store/business-profile-detail-slice";
import { ApiError } from "@/lib/api/http";
import type { SectionVisibility } from "./visibility-toggle";

/** Publish switch and per-section public visibility of an institution service; both save immediately. */
export function useServicePublishing(businessId: number, serviceId?: string) {
  const dispatch = useAppDispatch();
  const services = useAppSelector((state) => state.businessProfileDetail.services.items);

  const [publicVisibility, setPublicVisibility] = useState<Record<string, boolean>>(() => {
    const existing = serviceId ? services.find((s) => s.id === serviceId) : undefined;
    return existing?.public_visibility ?? {};
  });
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [isPublished, setIsPublished] = useState(() => {
    const existing = serviceId ? services.find((s) => s.id === serviceId) : undefined;
    return existing?.is_published ?? false;
  });
  const [publishing, setPublishing] = useState(false);

  // Controls whether that section shows on the public /course/[slug] page (see that page's own
  // isVisible) — same "absent/not-false means public" rule as the profile pages' visibility.
  const isSectionVisible = (section: string) => publicVisibility[section] !== false;
  const toggleSectionVisibility = async (section: string) => {
    if (!serviceId) return;
    const previous = publicVisibility;
    const next = { ...publicVisibility, [section]: !isSectionVisible(section) };
    setPublicVisibility(next);
    setSavingVisibility(true);
    try {
      await dispatch(updateService({ id: businessId, serviceId, patch: { public_visibility: next } })).unwrap();
    } catch (e) {
      setPublicVisibility(previous);
      toast.error("Couldn't update visibility", { description: (e as ApiError).message });
    } finally {
      setSavingVisibility(false);
    }
  };
  const sectionVisibility: SectionVisibility = { isVisible: isSectionVisible, onToggle: toggleSectionVisibility, disabled: savingVisibility || !serviceId };

  const handleTogglePublish = async (next: boolean) => {
    if (!serviceId) return;
    setPublishing(true);
    try {
      await dispatch(updateService({ id: businessId, serviceId, patch: { is_published: next } })).unwrap();
      setIsPublished(next);
      toast.success(next ? "Service published" : "Service unpublished");
    } catch (e) {
      toast.error("Couldn't update publish status", { description: (e as ApiError).message });
    } finally {
      setPublishing(false);
    }
  };

  return { setPublicVisibility, isPublished, setIsPublished, publishing, sectionVisibility, handleTogglePublish };
}
