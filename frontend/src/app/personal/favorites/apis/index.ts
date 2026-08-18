// No mock branch on purpose: §1.4 — a page that has gone live deletes its mock
// path, so this surface only ever talks to the real API. The backend routes exist
// (backend/src/modules/favorites/routes/favorites.routes.ts), so there is nothing
// for a mock to stand in for. createApi is still the right factory for a page whose
// backend does not exist yet.
export { favoritesRealApi as favoritesApi } from "./real-api";
export { FAVOURITE_ITEM_TYPES } from "./types";
export type {
  AddFavouriteInput,
  Favourite,
  FavouriteItemType,
  FavouriteTarget,
  FavouritesPage,
  PaginationMeta,
} from "./types";
