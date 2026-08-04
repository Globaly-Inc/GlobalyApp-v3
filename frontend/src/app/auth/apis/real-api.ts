import { httpGet } from "@/lib/api/http";
import type { Employee } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const authRealApi = {
  getEmployees: (): Promise<Employee[]> => httpGet(`${BASE_URL}/employees`),
};
