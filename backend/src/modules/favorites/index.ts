// Favourites module — the signed-in person's saved items, plus the saved list-view
// filters from V2's Universal Filter system.
//
// One module for both because both are per-platform-user preference data on master
// tables, read only by their owner (or, for a shared filter, their business scope),
// and neither needs a business context to function. Splitting them would be two
// registrations and two index files for one shape of thing.
//
// Registered inside the server's protected scope: every route needs a JWT, and the
// tenant plugin's req.business (when the token carries an orgId) is what scopes a
// saved filter to a business.

import type { FastifyInstance } from "fastify";

import { favoriteRoutes } from "./routes/favorites.routes.js";
import { savedFilterRoutes } from "./routes/saved-filters.routes.js";

export default async function favoritesModule(app: FastifyInstance) {
  await app.register(favoriteRoutes, { prefix: "/api/v3/favorites" });
  await app.register(savedFilterRoutes, { prefix: "/api/v3/filters" });
}
