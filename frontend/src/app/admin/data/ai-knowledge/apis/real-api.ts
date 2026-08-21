import { httpDelete, httpGet, httpPatch, httpPost, httpPostForm } from "@/lib/api/http";
import type {
  CategoryParams, CountryGuide, Faq, GuideParams, FaqParams, KnowledgeCounts,
  QueueItem, RackCategory, RackCounts, RackDocument, RackDocumentDetail,
  RackSource, SourceParams, UploadSourceOptions, UploadSourceResult, VisaEntry, VisaParams,
} from "./types";

const BASE = "/admin/ai-knowledge";

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : "";
};

export const aiKnowledgeRealApi = {
  getCounts: async (): Promise<KnowledgeCounts> => {
    const { counts } = await httpGet<{ counts: KnowledgeCounts }>(`${BASE}/overview`);
    return counts;
  },

  // ── Visa ──
  getVisas: async (q?: string): Promise<VisaEntry[]> => {
    const { visa } = await httpGet<{ visa: VisaEntry[] }>(`${BASE}/visa${qs({ q })}`);
    return visa;
  },
  createVisa: async (params: VisaParams): Promise<VisaEntry> => {
    const { visa } = await httpPost<{ visa: VisaEntry }>(`${BASE}/visa`, params);
    return visa;
  },
  updateVisa: async (id: string, params: VisaParams): Promise<VisaEntry> => {
    const { visa } = await httpPatch<{ visa: VisaEntry }>(`${BASE}/visa/${id}`, params);
    return visa;
  },
  deleteVisa: (id: string): Promise<void> => httpDelete(`${BASE}/visa/${id}`),

  // ── FAQs ──
  getFaqs: async (q?: string): Promise<Faq[]> => {
    const { faqs } = await httpGet<{ faqs: Faq[] }>(`${BASE}/faqs${qs({ q })}`);
    return faqs;
  },
  createFaq: async (params: FaqParams): Promise<Faq> => {
    const { faq } = await httpPost<{ faq: Faq }>(`${BASE}/faqs`, params);
    return faq;
  },
  updateFaq: async (id: string, params: FaqParams): Promise<Faq> => {
    const { faq } = await httpPatch<{ faq: Faq }>(`${BASE}/faqs/${id}`, params);
    return faq;
  },
  deleteFaq: (id: string): Promise<void> => httpDelete(`${BASE}/faqs/${id}`),

  // ── Country guides ──
  getGuides: async (q?: string): Promise<CountryGuide[]> => {
    const { guides } = await httpGet<{ guides: CountryGuide[] }>(`${BASE}/country-guides${qs({ q })}`);
    return guides;
  },
  createGuide: async (params: GuideParams): Promise<CountryGuide> => {
    const { guide } = await httpPost<{ guide: CountryGuide }>(`${BASE}/country-guides`, params);
    return guide;
  },
  updateGuide: async (id: string, params: GuideParams): Promise<CountryGuide> => {
    const { guide } = await httpPatch<{ guide: CountryGuide }>(`${BASE}/country-guides/${id}`, params);
    return guide;
  },
  deleteGuide: (id: string): Promise<void> => httpDelete(`${BASE}/country-guides/${id}`),

  // ── Verification queue ──
  getQueue: async (status?: string): Promise<QueueItem[]> => {
    const { queue } = await httpGet<{ queue: QueueItem[] }>(`${BASE}/verification-queue${qs({ status })}`);
    return queue;
  },
  approveQueueItem: (id: string): Promise<void> =>
    httpPost(`${BASE}/verification-queue/${id}/approve`, {}),
  rejectQueueItem: (id: string, rejection_reason: string): Promise<void> =>
    httpPost(`${BASE}/verification-queue/${id}/reject`, { rejection_reason }),

  // ── Rack ──
  getRackCounts: async (): Promise<RackCounts> => {
    const { counts } = await httpGet<{ counts: RackCounts }>(`${BASE}/rack/overview`);
    return counts;
  },
  getCategories: async (): Promise<RackCategory[]> => {
    const { categories } = await httpGet<{ categories: RackCategory[] }>(`${BASE}/categories`);
    return categories;
  },
  createCategory: async (params: CategoryParams): Promise<RackCategory> => {
    const { category } = await httpPost<{ category: RackCategory }>(`${BASE}/categories`, params);
    return category;
  },
  updateCategory: async (id: string, params: CategoryParams): Promise<RackCategory> => {
    const { category } = await httpPatch<{ category: RackCategory }>(`${BASE}/categories/${id}`, params);
    return category;
  },
  deleteCategory: (id: string): Promise<void> => httpDelete(`${BASE}/categories/${id}`),

  getSources: async (categoryId?: string, q?: string): Promise<RackSource[]> => {
    const { sources } = await httpGet<{ sources: RackSource[] }>(
      `${BASE}/sources${qs({ category_id: categoryId, q })}`,
    );
    return sources;
  },
  createSource: async (params: SourceParams): Promise<RackSource> => {
    const { source } = await httpPost<{ source: RackSource }>(`${BASE}/sources`, params);
    return source;
  },
  updateSource: async (id: string, params: SourceParams): Promise<RackSource> => {
    const { source } = await httpPatch<{ source: RackSource }>(`${BASE}/sources/${id}`, params);
    return source;
  },
  deleteSource: (id: string): Promise<void> => httpDelete(`${BASE}/sources/${id}`),
  crawlSource: (id: string, maxPages?: number): Promise<{ dispatched: boolean }> =>
    httpPost(`${BASE}/sources/${id}/crawl`, maxPages ? { max_pages: maxPages } : {}),
  uploadSource: (categoryId: string, file: File, opts?: UploadSourceOptions): Promise<UploadSourceResult> => {
    const form = new FormData();
    form.set("category_id", categoryId);
    if (opts?.title) form.set("title", opts.title);
    if (opts?.trust_tier) form.set("trust_tier", opts.trust_tier);
    form.set("file", file);
    return httpPostForm<UploadSourceResult>(`${BASE}/sources/upload`, form);
  },

  getDocuments: async (sourceId: string, q?: string): Promise<RackDocument[]> => {
    const { documents } = await httpGet<{ documents: RackDocument[] }>(
      `${BASE}/documents${qs({ source_id: sourceId, q })}`,
    );
    return documents;
  },
  getDocument: async (id: string): Promise<RackDocumentDetail> => {
    const { document } = await httpGet<{ document: RackDocumentDetail }>(`${BASE}/documents/${id}`);
    return document;
  },
  deleteDocument: (id: string): Promise<void> => httpDelete(`${BASE}/documents/${id}`),
};
