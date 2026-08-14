import { httpDelete, httpGet, httpPatch } from "@/lib/api/http";
import type { Lesson } from "./types";

export const aiMemoryRealApi = {
  getLessons: async (): Promise<Lesson[]> => {
    const { lessons } = await httpGet<{ lessons: Lesson[] }>("/admin/data-extraction/lessons?limit=100");
    return lessons;
  },

  toggleLesson: async (id: string, isActive: boolean): Promise<void> => {
    await httpPatch(`/admin/data-extraction/lessons/${id}`, { is_active: isActive });
  },

  deleteLesson: async (id: string): Promise<void> => {
    await httpDelete(`/admin/data-extraction/lessons/${id}`);
  },
};
