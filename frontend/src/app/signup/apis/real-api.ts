import { httpGet } from "@/lib/api/http";
import type { Lead } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const signupRealApi = {
  getLeads: (): Promise<Lead[]> => httpGet(`${BASE_URL}/leads`),
};
