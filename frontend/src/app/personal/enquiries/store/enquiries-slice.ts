import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { enquiriesApi } from "../apis";

import type {
  Course,
  CreateEnquiryInput,
  EligibilityVerdict,
  Enquiry,
  EnquiryListItem,
  EnquiryListParams,
} from "../apis/types";
import type { RootState } from "@/lib/store";

export const createEnquiry = createAsyncThunk("enquiries/create", (input: CreateEnquiryInput) =>
  enquiriesApi.createEnquiry(input),
);

export const fetchEnquiries = createAsyncThunk(
  "enquiries/fetchAll",
  // `| void` so callers that just want a refresh — the new-enquiry dialog after a successful
  // create — can dispatch it bare and land on page 1, which is where the new row will be.
  async (params: EnquiryListParams | void = {}) => {
    const list = await enquiriesApi.listEnquiries(params || {});
    return { enquiries: list.data, meta: list.meta, counts: list.counts ?? {} };
  },
  // No in-flight guard: typing in the search box fires a request per debounce tick, and dropping
  // the newest one would leave the list showing results for an older term.
);

export const fetchEnquiry = createAsyncThunk("enquiries/fetchOne", (id: string) => enquiriesApi.getEnquiry(id));

/**
 * Course + institution options for the new-enquiry picker. Kept in this slice
 * rather than reusing the courses feature's state, so opening the dialog can't
 * be confused with the enquiry list itself.
 *
 * ponytail: one generous page, filtered client-side by the Combobox — fine while
 * the catalog fits in it. Add a `q` param to GET /courses and switch to
 * onQueryChange when it doesn't.
 */
export const fetchCourseOptions = createAsyncThunk(
  "enquiries/fetchCourseOptions",
  async () => (await enquiriesApi.listCourses(1, 100)).data,
  {
    condition: (_, { getState }) => {
      const s = (getState() as RootState).enquiries;
      return s.courseOptionsStatus !== "loading" && s.courseOptions.length === 0;
    },
  },
);

/**
 * The student's eligibility for the course currently selected in the dialog.
 *
 * Cached per course id so switching back and forth doesn't refetch, and so the acknowledgement
 * checkbox can key off the same verdict the panel is showing. The server re-evaluates on submit
 * regardless — this is display state, not the decision.
 */
export const fetchEligibility = createAsyncThunk(
  "enquiries/fetchEligibility",
  (courseId: string) => enquiriesApi.getEligibility(courseId),
  {
    condition: (courseId, { getState }) => {
      const s = (getState() as RootState).enquiries;
      return s.eligibilityStatus !== "loading" && !s.eligibilityByCourse[courseId];
    },
  },
);

type EnquiriesState = {
  items: EnquiryListItem[];
  byId: Record<string, Enquiry>;
  courseOptions: Course[];
  courseOptionsStatus: "idle" | "loading" | "failed";
  status: "idle" | "loading" | "failed";
  /** Page state for the list — `total` drives the paginator, so it is the FILTERED total. */
  page: number;
  total: number;
  /** Per-status totals from the server — what the filter pills count, across every page. */
  countsByStatus: Record<string, number>;
  createStatus: "idle" | "saving" | "failed";
  eligibilityByCourse: Record<string, EligibilityVerdict>;
  eligibilityStatus: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: EnquiriesState = {
  items: [],
  byId: {},
  courseOptions: [],
  courseOptionsStatus: "idle",
  status: "idle",
  page: 1,
  total: 0,
  countsByStatus: {},
  createStatus: "idle",
  eligibilityByCourse: {},
  eligibilityStatus: "idle",
  error: null,
};

const enquiriesSlice = createSlice({
  name: "enquiries",
  initialState,
  reducers: {
    resetEnquiriesError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEnquiries.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchEnquiries.fulfilled, (state, action) => {
        state.status = "idle";
        state.items = action.payload.enquiries;
        state.page = action.payload.meta.page;
        state.total = action.payload.meta.total;
        state.countsByStatus = action.payload.counts;
      })
      .addCase(fetchEnquiries.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load enquiries";
      })
      .addCase(fetchEnquiry.fulfilled, (state, action) => {
        state.byId[action.payload.id] = action.payload;
      })
      .addCase(fetchCourseOptions.pending, (state) => {
        state.courseOptionsStatus = "loading";
      })
      .addCase(fetchCourseOptions.fulfilled, (state, action) => {
        state.courseOptionsStatus = "idle";
        state.courseOptions = action.payload;
      })
      .addCase(fetchCourseOptions.rejected, (state) => {
        state.courseOptionsStatus = "failed";
      })
      .addCase(fetchEligibility.pending, (state) => {
        state.eligibilityStatus = "loading";
      })
      .addCase(fetchEligibility.fulfilled, (state, action) => {
        state.eligibilityStatus = "idle";
        state.eligibilityByCourse[action.meta.arg] = action.payload;
      })
      // A verdict that can't be fetched must not block the enquiry — the server is the gate, and
      // it will 400 with the reason if the student really is ineligible.
      .addCase(fetchEligibility.rejected, (state) => {
        state.eligibilityStatus = "failed";
      })
      .addCase(createEnquiry.pending, (state) => {
        state.createStatus = "saving";
        state.error = null;
      })
      .addCase(createEnquiry.fulfilled, (state, action) => {
        state.createStatus = "idle";
        state.byId[action.payload.id] = action.payload;
      })
      .addCase(createEnquiry.rejected, (state, action) => {
        state.createStatus = "failed";
        state.error = action.error.message ?? "Failed to submit enquiry";
      });
  },
});

export const { resetEnquiriesError } = enquiriesSlice.actions;
export const enquiriesReducer = enquiriesSlice.reducer;
