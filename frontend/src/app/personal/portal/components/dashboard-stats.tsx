"use client";

import { useEffect, useRef } from "react";
import { Heart, MessageSquare, GraduationCap } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { StatCard } from "@/components/ui/stat-card";
import { fetchEnquiries } from "../../enquiries/store/enquiries-slice";

export function DashboardStats() {
  const dispatch = useAppDispatch();
  const completion = useAppSelector((state) => state.profile.profile?.completion?.percentage ?? 0);
  const enquiriesTotal = useAppSelector((state) => state.enquiries.total);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchEnquiries({ page: 1, limit: 1 }));
  }, [dispatch]);

  // ponytail: favorites stays 0 — no favorites table/entity exists in v3 yet, unlike
  // enquiries and profile completion which already have real backing data.
  const stats = [
    { label: "Favorites", value: 0, icon: Heart },
    { label: "Enquiries", value: enquiriesTotal, icon: MessageSquare },
    { label: "Profile", value: `${completion}%`, icon: GraduationCap },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {stats.map((stat) => (
        <StatCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} />
      ))}
    </div>
  );
}
