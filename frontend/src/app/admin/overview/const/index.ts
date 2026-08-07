import { Building2, Users, FileCheck, GraduationCap } from "lucide-react";
import type { StatCardConfig } from "../types";

export const STAT_CARDS: StatCardConfig[] = [
  { key: "businesses", label: "Businesses", icon: Building2 },
  { key: "platform_users", label: "Platform Users", icon: Users },
  { key: "active_extractions", label: "Active Extractions", icon: FileCheck },
  { key: "scholarships_listed", label: "Scholarships Listed", icon: GraduationCap },
];
