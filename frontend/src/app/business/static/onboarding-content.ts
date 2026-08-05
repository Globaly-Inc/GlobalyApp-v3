import { Users, Building2, Briefcase, Landmark } from "lucide-react";
import type { BusinessType } from "../apis/types";

export const BUSINESS_TYPES: { value: BusinessType; icon: typeof Users; title: string; description: string }[] = [
  { value: "agent", icon: Users, title: "Education Agent", description: "Recruit and counsel students for institutions worldwide" },
  { value: "institution", icon: Building2, title: "Institution", description: "A university, college, or school offering courses" },
  { value: "service_provider", icon: Briefcase, title: "Service Provider", description: "Test prep, visa, migration, or other student services" },
  { value: "immigration_department", icon: Landmark, title: "Immigration Department", description: "A government migration or visa authority" },
];
