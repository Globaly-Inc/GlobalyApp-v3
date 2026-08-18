import type { FastifyInstance } from "fastify";

import { BASE_CURRENCY } from "../consts.js";
import * as fxService from "../services/fx.service.js";

export async function fxRoutes(app: FastifyInstance) {
  /**
   * GET /fx-rates — public, cached, AUD-based.
   *
   * Response shape is V2's contract verbatim: `{ rates, stale }`, plus `base` so a
   * client never has to assume AUD. Rate-limited above the global default because
   * this is a single indexed read that the search page calls on load; the provider
   * call behind it is at most one per 6h window.
   */
  app.get(
    "/fx-rates",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (_req, reply) => {
      const result = await fxService.getRates(BASE_CURRENCY);
      return reply.send({ base: BASE_CURRENCY, ...result });
    },
  );
}
