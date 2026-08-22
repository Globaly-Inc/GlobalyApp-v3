import type {
  CategoryParams, CountryGuide, Faq, FaqParams, GuideParams, KnowledgeCounts,
  QueueItem, RackCategory, RackCounts, RackDocument, RackDocumentDetail,
  RackSource, SourceParams, UploadSourceOptions, UploadSourceResult, VisaEntry, VisaParams,
} from "./types";

const delay = (ms = 220) => new Promise((r) => setTimeout(r, ms));
const now = "2026-08-14T09:00:00.000Z";
const uid = () => `mock-${Math.random().toString(36).slice(2, 10)}`;

const visas: VisaEntry[] = [
  {
    id: "visa-1", destination_country: "Australia", visa_type: "Student visa (subclass 500)",
    eligible_nationalities: ["NP", "IN", "VN"], requirements: { funds_aud: 29710 },
    required_documents: ["CoE", "OSHC", "GTE statement"], processing_time_days: 42,
    application_fee_usd: 1030, work_rights_hours: 48, post_study_visa: "Subclass 485",
    common_rejections: ["Insufficient funds", "Weak GTE statement"],
    last_verified_date: "2026-07-01", active: true, created_at: now, updated_at: now,
  },
  {
    id: "visa-2", destination_country: "Canada", visa_type: "Study Permit",
    eligible_nationalities: null, requirements: { gic_cad: 20635 },
    required_documents: ["Letter of acceptance", "GIC certificate"], processing_time_days: 56,
    application_fee_usd: 110, work_rights_hours: 24, post_study_visa: "PGWP",
    common_rejections: ["Ties to home country not established"],
    last_verified_date: "2026-06-14", active: true, created_at: now, updated_at: now,
  },
];

const faqs: Faq[] = [
  {
    id: "faq-1", question: "How many hours can I work on a student visa in Australia?",
    answer: "48 hours per fortnight while your course is in session, and unlimited during scheduled course breaks.",
    tags: ["work-rights", "australia"], active: true, created_by: 1, created_at: now, updated_at: now,
  },
  {
    id: "faq-2", question: "Do I need IELTS for a Canadian study permit?",
    answer: "Not for the permit itself, but nearly every institution requires proof of English for admission.",
    tags: ["english", "canada"], active: true, created_by: 1, created_at: now, updated_at: now,
  },
];

const guides: CountryGuide[] = [
  {
    id: "guide-1", country: "Australia", education_system: "AQF levels 1-10",
    popular_cities: ["Melbourne", "Sydney", "Brisbane"],
    cost_of_living_monthly_usd: { rent: 1100, food: 400, transport: 110 },
    culture_notes: "Informal, direct communication style.",
    student_life: "Strong campus club culture and part-time work availability.",
    climate: "Temperate in the south, tropical in the north.",
    last_verified_date: "2026-07-20", active: true, created_at: now, updated_at: now,
  },
];

const queue: QueueItem[] = [
  {
    id: "q-1", submitted_by: 42, submitter_type: "agent", data_type: "visa",
    data_id: "visa-1", status: "pending", rejection_reason: null,
    reviewed_by: null, reviewed_at: null, created_at: now,
  },
  {
    id: "q-2", submitted_by: 17, submitter_type: "institution", data_type: "country_guide",
    data_id: "guide-1", status: "verified", rejection_reason: null,
    reviewed_by: 1, reviewed_at: now, created_at: now,
  },
];

const categories: RackCategory[] = [
  {
    id: "cat-1", slug: "au-visa", label: "Australia — Visa", kind: "visa", country_code: "AU",
    description: "Home Affairs and Study Australia pages.", active: true, sort_order: 1,
    created_at: now, updated_at: now,
  },
  {
    id: "cat-2", slug: "ca-gov", label: "Canada — Gov updates", kind: "gov_update", country_code: "CA",
    description: null, active: true, sort_order: 2, created_at: now, updated_at: now,
  },
];

const sources: RackSource[] = [
  {
    id: "src-1", category_id: "cat-1", source_type: "url", url: "https://immi.homeaffairs.gov.au/visas/student",
    file_name: null, domain: "immi.homeaffairs.gov.au", title: "Student visa hub", trust_tier: "gov",
    crawl_frequency: "weekly", last_crawled_at: now, last_verified_at: now,
    effective_until: null, last_status: "ok", last_error: null,
    doc_count: 12, active: true, added_via: "manual", max_pages: 25,
    crawl_summary: {
      discovered: 14, discovery_method: "sitemap", discovery_error: null, scraped: 12,
      added: 3, updated: 2, unchanged: 7, failed: 2, embedded: 5, max_pages: 25, finished_at: now,
    },
    created_at: now, updated_at: now,
  },
  {
    id: "src-2", category_id: "cat-1", source_type: "url", url: "https://www.studyaustralia.gov.au/apply",
    file_name: null, domain: "studyaustralia.gov.au", title: null, trust_tier: "gov",
    crawl_frequency: "monthly", last_crawled_at: null, last_verified_at: null,
    effective_until: null, last_status: null, last_error: null,
    doc_count: 0, active: true, added_via: "manual", max_pages: null, crawl_summary: null,
    created_at: now, updated_at: now,
  },
  {
    id: "src-3", category_id: "cat-1", source_type: "file", url: null,
    file_name: "gte-checklist.pdf", domain: "upload", title: "GTE checklist", trust_tier: "gov",
    crawl_frequency: "off", last_crawled_at: now,
    // Verified eight months ago and past its stated validity — the amber and red states.
    last_verified_at: new Date(Date.now() - 240 * 86_400_000).toISOString(),
    effective_until: new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10),
    last_status: "ok", last_error: null,
    doc_count: 1, active: true, added_via: "manual", max_pages: null, crawl_summary: null,
    created_at: now, updated_at: now,
  },
];

const documents: RackDocument[] = [
  {
    id: "doc-1", source_id: "src-1", category_id: "cat-1",
    url: "https://immi.homeaffairs.gov.au/visas/student", title: "Student visa (subclass 500)",
    content_hash: "a1b2c3", word_count: 842, chunk_count: 6, crawled_at: now, active: true, is_embedded: true,
    created_at: now, updated_at: now,
  },
  {
    id: "doc-2", source_id: "src-1", category_id: "cat-1",
    url: "https://immi.homeaffairs.gov.au/visas/student/work", title: "Work conditions",
    content_hash: "d4e5f6", word_count: 431, chunk_count: 0, crawled_at: now, active: true, is_embedded: false,
    created_at: now, updated_at: now,
  },
];

const search = <T,>(rows: T[], q: string | undefined, fields: (keyof T)[]) => {
  if (!q) return rows;
  const needle = q.toLowerCase();
  return rows.filter((row) => fields.some((f) => String(row[f] ?? "").toLowerCase().includes(needle)));
};

export const aiKnowledgeMockApi = {
  getCounts: async (): Promise<KnowledgeCounts> => {
    console.log("[mock] ai-knowledge getCounts");
    await delay();
    return { visa: visas.length, faqs: faqs.length, guides: guides.length, pending_reviews: queue.filter((q) => q.status === "pending").length };
  },

  getVisas: async (q?: string) => { console.log("[mock] getVisas", q); await delay(); return search(visas, q, ["visa_type", "destination_country"]); },
  createVisa: async (params: VisaParams) => { console.log("[mock] createVisa"); await delay(); return { ...visas[0], ...params, id: uid() } as VisaEntry; },
  updateVisa: async (id: string, params: VisaParams) => { console.log("[mock] updateVisa", id); await delay(); return { ...visas[0], ...params, id } as VisaEntry; },
  deleteVisa: async (id: string) => { console.log("[mock] deleteVisa", id); await delay(); },

  getFaqs: async (q?: string) => { console.log("[mock] getFaqs", q); await delay(); return search(faqs, q, ["question", "answer"]); },
  createFaq: async (params: FaqParams) => { console.log("[mock] createFaq"); await delay(); return { ...faqs[0], ...params, id: uid() } as Faq; },
  updateFaq: async (id: string, params: FaqParams) => { console.log("[mock] updateFaq", id); await delay(); return { ...faqs[0], ...params, id } as Faq; },
  deleteFaq: async (id: string) => { console.log("[mock] deleteFaq", id); await delay(); },

  getGuides: async (q?: string) => { console.log("[mock] getGuides", q); await delay(); return search(guides, q, ["country"]); },
  createGuide: async (params: GuideParams) => { console.log("[mock] createGuide"); await delay(); return { ...guides[0], ...params, id: uid() } as CountryGuide; },
  updateGuide: async (id: string, params: GuideParams) => { console.log("[mock] updateGuide", id); await delay(); return { ...guides[0], ...params, id } as CountryGuide; },
  deleteGuide: async (id: string) => { console.log("[mock] deleteGuide", id); await delay(); },

  getQueue: async (status?: string) => { console.log("[mock] getQueue", status); await delay(); return status ? queue.filter((q) => q.status === status) : queue; },
  approveQueueItem: async (id: string) => { console.log("[mock] approveQueueItem", id); await delay(); },
  rejectQueueItem: async (id: string, reason: string) => { console.log("[mock] rejectQueueItem", id, reason); await delay(); },

  getRackCounts: async (): Promise<RackCounts> => {
    console.log("[mock] getRackCounts");
    await delay();
    return {
      categories: categories.length, sources: sources.length, documents: documents.length,
      embedded_documents: documents.filter((d) => d.is_embedded).length,
      embedded_chunks: documents.reduce((sum, d) => sum + d.chunk_count, 0),
    };
  },
  getCategories: async () => { console.log("[mock] getCategories"); await delay(); return categories; },
  createCategory: async (params: CategoryParams) => { console.log("[mock] createCategory"); await delay(); return { ...categories[0], ...params, id: uid() } as RackCategory; },
  updateCategory: async (id: string, params: CategoryParams) => { console.log("[mock] updateCategory", id); await delay(); return { ...categories[0], ...params, id } as RackCategory; },
  deleteCategory: async (id: string) => { console.log("[mock] deleteCategory", id); await delay(); },

  getSources: async (categoryId?: string, q?: string) => {
    console.log("[mock] getSources", categoryId, q);
    await delay();
    return search(categoryId ? sources.filter((s) => s.category_id === categoryId) : sources, q, ["url", "domain", "title"]);
  },
  createSource: async (params: SourceParams) => { console.log("[mock] createSource"); await delay(); return { ...sources[1], ...params, id: uid() } as RackSource; },
  updateSource: async (id: string, params: SourceParams) => { console.log("[mock] updateSource", id); await delay(); return { ...sources[0], ...params, id } as RackSource; },
  deleteSource: async (id: string) => { console.log("[mock] deleteSource", id); await delay(); },
  crawlSource: async (id: string, maxPages?: number) => { console.log("[mock] crawlSource", id, maxPages); await delay(); return { dispatched: true }; },
  verifySource: async (id: string): Promise<RackSource> => {
    console.log("[mock] verifySource", id);
    const source = sources.find((s) => s.id === id)!;
    source.last_verified_at = new Date().toISOString();
    return source;
  },
  uploadSource: async (categoryId: string, file: File, opts?: UploadSourceOptions): Promise<UploadSourceResult> => {
    console.log("[mock] uploadSource", categoryId, file.name, opts);
    await delay();
    const source = {
      ...sources[2], id: uid(), category_id: categoryId, file_name: file.name,
      title: opts?.title ?? file.name, trust_tier: opts?.trust_tier ?? "other",
    } as RackSource;
    return { source, document_id: uid(), chunks: 3, embedded: 3 };
  },

  getDocuments: async (sourceId: string, q?: string) => {
    console.log("[mock] getDocuments", sourceId, q);
    await delay();
    return search(documents.filter((d) => d.source_id === sourceId), q, ["title", "url"]);
  },
  getDocument: async (id: string): Promise<RackDocumentDetail> => {
    console.log("[mock] getDocument", id);
    await delay();
    const doc = documents.find((d) => d.id === id) ?? (documents[0] as RackDocument);
    return { ...doc, markdown: `# ${doc.title}\n\nMock document body for local development.` };
  },
  deleteDocument: async (id: string) => { console.log("[mock] deleteDocument", id); await delay(); },
};
