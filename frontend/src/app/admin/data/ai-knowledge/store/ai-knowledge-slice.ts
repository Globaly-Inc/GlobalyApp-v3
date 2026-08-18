import { createAsyncThunk, createSlice, isAnyOf } from "@reduxjs/toolkit";
import { aiKnowledgeApi } from "../apis";
import type {
  CountryGuide, EmbeddingStatus, Faq, KnowledgeCounts, QueueItem, RackCategory,
  RackCounts, RackDocument, RackSource, VisaEntry,
} from "../apis/types";

export const fetchCounts = createAsyncThunk("dataAiKnowledge/counts", () => aiKnowledgeApi.getCounts());
export const fetchRackCounts = createAsyncThunk("dataAiKnowledge/rackCounts", () => aiKnowledgeApi.getRackCounts());
export const fetchEmbeddingStatus = createAsyncThunk(
  "dataAiKnowledge/embeddingStatus",
  () => aiKnowledgeApi.getEmbeddingStatus(),
);
export const fetchVisas = createAsyncThunk("dataAiKnowledge/visas", (q: string | undefined) => aiKnowledgeApi.getVisas(q));
export const fetchFaqs = createAsyncThunk("dataAiKnowledge/faqs", (q: string | undefined) => aiKnowledgeApi.getFaqs(q));
export const fetchGuides = createAsyncThunk("dataAiKnowledge/guides", (q: string | undefined) => aiKnowledgeApi.getGuides(q));
export const fetchQueue = createAsyncThunk("dataAiKnowledge/queue", (status: string | undefined) => aiKnowledgeApi.getQueue(status));
export const fetchCategories = createAsyncThunk("dataAiKnowledge/categories", () => aiKnowledgeApi.getCategories());
export const fetchSources = createAsyncThunk(
  "dataAiKnowledge/sources",
  ({ categoryId, q }: { categoryId?: string; q?: string }) => aiKnowledgeApi.getSources(categoryId, q),
);
export const fetchDocuments = createAsyncThunk(
  "dataAiKnowledge/documents",
  ({ sourceId, q }: { sourceId: string; q?: string }) => aiKnowledgeApi.getDocuments(sourceId, q),
);

type AiKnowledgeState = {
  counts: KnowledgeCounts | null;
  rackCounts: RackCounts | null;
  embeddingStatus: EmbeddingStatus | null;
  visas: VisaEntry[];
  faqs: Faq[];
  guides: CountryGuide[];
  queue: QueueItem[];
  categories: RackCategory[];
  sources: RackSource[];
  documents: RackDocument[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: AiKnowledgeState = {
  counts: null, rackCounts: null, embeddingStatus: null,
  visas: [], faqs: [], guides: [], queue: [],
  categories: [], sources: [], documents: [],
  status: "idle", error: null,
};

const aiKnowledgeSlice = createSlice({
  name: "dataAiKnowledge",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCounts.fulfilled, (s, a) => { s.counts = a.payload; })
      .addCase(fetchRackCounts.fulfilled, (s, a) => { s.rackCounts = a.payload; })
      .addCase(fetchEmbeddingStatus.fulfilled, (s, a) => { s.embeddingStatus = a.payload; })
      .addCase(fetchVisas.fulfilled, (s, a) => { s.visas = a.payload; })
      .addCase(fetchFaqs.fulfilled, (s, a) => { s.faqs = a.payload; })
      .addCase(fetchGuides.fulfilled, (s, a) => { s.guides = a.payload; })
      .addCase(fetchQueue.fulfilled, (s, a) => { s.queue = a.payload; })
      .addCase(fetchCategories.fulfilled, (s, a) => { s.categories = a.payload; })
      .addCase(fetchSources.fulfilled, (s, a) => { s.sources = a.payload; })
      .addCase(fetchDocuments.fulfilled, (s, a) => { s.documents = a.payload; })
      // One shared status for the page — every tab shows a single spinner, so
      // tracking a flag per resource would be state nobody reads.
      .addMatcher(
        isAnyOf(fetchVisas.pending, fetchFaqs.pending, fetchGuides.pending, fetchQueue.pending,
          fetchCategories.pending, fetchSources.pending, fetchDocuments.pending),
        (s) => { s.status = "loading"; s.error = null; },
      )
      .addMatcher(
        isAnyOf(fetchVisas.fulfilled, fetchFaqs.fulfilled, fetchGuides.fulfilled, fetchQueue.fulfilled,
          fetchCategories.fulfilled, fetchSources.fulfilled, fetchDocuments.fulfilled),
        (s) => { s.status = "idle"; },
      )
      .addMatcher(
        isAnyOf(fetchVisas.rejected, fetchFaqs.rejected, fetchGuides.rejected, fetchQueue.rejected,
          fetchCategories.rejected, fetchSources.rejected, fetchDocuments.rejected),
        (s, a) => { s.status = "failed"; s.error = a.error.message ?? "Failed to load the knowledge base."; },
      );
  },
});

export const aiKnowledgeReducer = aiKnowledgeSlice.reducer;
