import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { enquiriesApi } from "../apis";
import { coursesApi, type Course } from "@/app/personal/courses/apis";
import type { CreateEnquiryInput, Enquiry, EnquiryListItem } from "../apis/types";
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
 * clobber the /personal/courses page's own list and pagination.
 *
 * ponytail: one generous page, filtered client-side by the Combobox — fine while
 * the catalog fits in it. Add a `q` param to GET /courses and switch to
 * onQueryChange when it doesn't.
 */
export const fetchCourseOptions = createAsyncThunk(
  "enquiries/fetchCourseOptions",
  async () => (await coursesApi.listCourses(1, 100)).data,
  {
    condition: (_, { getState }) => {
      const s = (getState() as RootState).enquiries;
      return s.courseOptionsStatus !== "loading" && s.courseOptions.length === 0;
    },
  },
);

type EnquiriesState = {
  items: EnquiryListItem[];
  /** Keyed by the raw route param, so the detail view's lookup always matches. */
  byId: Record<string, Enquiry>;
  courseOptions: Course[];
  courseOptionsStatus: "idle" | "loading" | "failed";
  status: "idle" | "loading" | "failed";
  createStatus: "idle" | "saving" | "failed";
  error: string | null;
};

const initialState: EnquiriesState = {
  items: [],
  byId: {},
  courseOptions: [],
  courseOptionsStatus: "idle",
  status: "idle",
  createStatus: "idle",
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
        // meta.arg, not payload.id: the id on the wire is a number and the detail
        // view looks up by the string it got from the URL.
        state.byId[action.meta.arg] = action.payload;
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
      .addCase(createEnquiry.pending, (state) => {
        state.createStatus = "saving";
        state.error = null;
      })
      .addCase(createEnquiry.fulfilled, (state) => {
        state.createStatus = "idle";
        // POST /enquiries answers with the fan-out result, not an enquiry row, so
        // there is nothing to cache here. The dialog refetches the list, which is
        // what the screen actually renders.
      })
      .addCase(createEnquiry.rejected, (state, action) => {
        state.createStatus = "failed";
        state.error = action.error.message ?? "Failed to submit enquiry";
      });
  },
});

export const { resetEnquiriesError } = enquiriesSlice.actions;
export const enquiriesReducer = enquiriesSlice.reducer;
