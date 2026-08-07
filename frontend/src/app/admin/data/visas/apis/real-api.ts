import { httpGet } from "@/lib/api/http";
import type { VisaSummary } from "./types";

export const visasRealApi = {
  getVisas: async (): Promise<VisaSummary[]> => {
    const { visas } = await httpGet<{ visas: VisaSummary[] }>("/admin/data-extraction/visas");
    return visas;
  },
};
