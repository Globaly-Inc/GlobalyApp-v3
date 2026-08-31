import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { enquiriesApi } from "../apis";

import type { Course, CreateEnquiryInput, EligibilityVerdict, Enquiry, EnquiryListItem } from "../apis/types";
import type { RootState } from "@/lib/store";

export const createEnquiry = createAsyncThunk("enquiries/create", (input: CreateEnquiryInput) =>
  enquiriesApi.createEnquiry(input),
);

export const fetchEnquiries = createAsyncThunk(
  "enquiries/fetchAll",
  async () => {
    const list = await enquiriesApi.listEnquiries();
    return { enquiries: list.data };
  },
  { condition: (_, { getState }) => (getState() as RootState).enquiries.status !== "loading" },
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
