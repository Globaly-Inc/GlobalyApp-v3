import type { Guide, GuideFiles, GuideInput, GuideListParams, GuideWithLeadCount, Paginated } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function paginate<T>(rows: T[], { page = 1, limit = 20 }: GuideListParams): Paginated<T> {
  const offset = (page - 1) * limit;
  return {
    data: rows.slice(offset, offset + limit),
    meta: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) },
  };
}

let nextId = 100;
const newId = () => ++nextId;
const leadCounts = new Map<number, number>([[1, 42], [2, 0]]);

const guides: Guide[] = [
  {
    id: 1, title: "The Ultimate Guide to Studying in Canada", slug: "ultimate-guide-studying-canada",
    country: "Canada", context: "Everything you need to know before you apply — costs, visas, and top programs.",
    background_image_url: "https://images.unsplash.com/photo-1503614472-8c93d56e92ce?w=1600", background_video_url: null,
    pdf_url: "guides/pdfs/mock.pdf", pdf_cover_image_url: "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=600",
    is_published: true, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z",
  },
  {
    id: 2, title: "UK Student Visa Checklist", slug: "uk-student-visa-checklist",
    country: "United Kingdom", context: "A step-by-step checklist for your UK student visa application.",
    background_image_url: null, background_video_url: null,
    pdf_url: null, pdf_cover_image_url: null,
    is_published: false, created_at: "2026-01-05T00:00:00.000Z", updated_at: "2026-01-05T00:00:00.000Z",
  },
];

export const guidesMockApi = {
  getGuides: async (params: GuideListParams = {}): Promise<Paginated<GuideWithLeadCount>> => {
    console.log("[mock] GET /admin/marketing/guides", params);
    await delay(300);
    let rows = guides;
    if (params.search) rows = rows.filter((g) => g.title.toLowerCase().includes(params.search!.toLowerCase()));
    if (params.is_published !== undefined) rows = rows.filter((g) => g.is_published === params.is_published);
    const withCounts = rows.map((g) => ({ ...g, lead_count: leadCounts.get(g.id) ?? 0 }));
    return paginate(withCounts, params);
  },
  getGuideById: async (id: number): Promise<Guide> => {
    console.log("[mock] GET /admin/marketing/guides/:id", id);
    await delay(200);
    const row = guides.find((g) => g.id === id);
    if (!row) throw new Error("Guide not found");
    return row;
  },
  createGuide: async (input: GuideInput, _files: GuideFiles = {}): Promise<Guide> => {
    console.log("[mock] POST /admin/marketing/guides", input);
    await delay(300);
    const row: Guide = { id: newId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...input };
    guides.unshift(row);
    leadCounts.set(row.id, 0);
    return row;
  },
  updateGuide: async (id: number, input: Partial<GuideInput>, _files: GuideFiles = {}): Promise<Guide> => {
    console.log("[mock] PATCH /admin/marketing/guides/:id", id, input);
    await delay(300);
    const idx = guides.findIndex((g) => g.id === id);
    const existing = guides[idx];
    if (idx === -1 || !existing) throw new Error("Guide not found");
    const updated: Guide = { ...existing, ...input, updated_at: new Date().toISOString() };
    guides[idx] = updated;
    return updated;
  },
  deleteGuide: async (id: number): Promise<void> => {
    console.log("[mock] DELETE /admin/marketing/guides/:id", id);
    await delay(200);
    const idx = guides.findIndex((g) => g.id === id);
    if (idx !== -1) guides.splice(idx, 1);
  },
};
