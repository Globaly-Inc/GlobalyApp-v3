"use client";

import { useEffect, useRef } from "react";
import { Heart, MessageSquare, GraduationCap } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { Card, CardContent } from "@/components/ui/card";
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
    { label: "Favorites", value: 0, icon: Heart, tint: "bg-rose-50 text-rose-600" },
    { label: "Enquiries", value: enquiriesTotal, icon: MessageSquare, tint: "bg-blue-50 text-blue-600" },
    { label: "Profile", value: `${completion}%`, icon: GraduationCap, tint: "bg-violet-50 text-violet-600" },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="flex flex-col items-center gap-1.5 py-4 text-center">
            <span className={`inline-flex rounded-full p-2 ${stat.tint}`}>
              <stat.icon className="h-4 w-4" />
            </span>
            <p className="text-lg font-semibold">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
