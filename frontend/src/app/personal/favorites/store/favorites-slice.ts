import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { favoritesApi } from "../apis";
import type { AddFavouriteInput, Favourite, FavouriteItemType, FavouritesPage } from "../apis";
import { ALL_TAB, type FavouriteTabKey } from "../const";

export const fetchFavourites = createAsyncThunk(
  "favorites/list",
  (params: { item_type?: FavouriteItemType; page?: number } = {}) => favoritesApi.list(params),
);

export const saveFavourite = createAsyncThunk(
  "favorites/save",
  async (input: AddFavouriteInput) => {
    await favoritesApi.save(input);
    return input;
  },
);

export const removeFavourite = createAsyncThunk("favorites/remove", async (id: number) => {
  await favoritesApi.remove(id);
  return id;
});

type Status = "idle" | "loading" | "failed";

interface State {
  items: Favourite[];
  counts: FavouritesPage["counts"];
  meta: FavouritesPage["meta"];
  tab: FavouriteTabKey;
  status: Status;
  /** Ids currently mid-DELETE, so the card can disable its own button only. */
  removing: number[];
  error: string | null;
}

const initialState: State = {
  items: [],
  counts: {},
  meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
  tab: ALL_TAB,
  status: "idle",
  removing: [],
  error: null,
};

const slice = createSlice({
  name: "favorites",
  initialState,
  reducers: {
    setTab(state, action: { payload: FavouriteTabKey }) {
      state.tab = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFavourites.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchFavourites.fulfilled, (state, action) => {
        state.status = "idle";
        state.items = action.payload.data;
        state.counts = action.payload.counts;
        state.meta = action.payload.meta;
      })
      .addCase(fetchFavourites.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Could not load your saved items.";
      })

      .addCase(removeFavourite.pending, (state, action) => {
        state.removing.push(action.meta.arg);
      })
      .addCase(removeFavourite.fulfilled, (state, action) => {
        const row = state.items.find((item) => item.id === action.payload);
        state.items = state.items.filter((item) => item.id !== action.payload);
        state.removing = state.removing.filter((id) => id !== action.payload);
        state.meta.total = Math.max(state.meta.total - 1, 0);
        // Keep the tab badges honest without a refetch: the server already accepted
        // the delete, so the count it would return is this one minus one.
        if (row) {
          state.counts[row.item_type] = Math.max((state.counts[row.item_type] ?? 1) - 1, 0);
        }
      })
      .addCase(removeFavourite.rejected, (state, action) => {
        state.removing = state.removing.filter((id) => id !== action.meta.arg);
        state.error = action.error.message ?? "Could not remove that item.";
      })

      .addCase(saveFavourite.rejected, (state, action) => {
        state.error = action.error.message ?? "Could not save that item.";
      });
  },
});

export const { setTab } = slice.actions;
export const favoritesReducer = slice.reducer;
