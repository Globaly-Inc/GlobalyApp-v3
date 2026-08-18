// AI Counsellor module — conversational study-abroad advisor with streaming responses.
//
// Registered at the ROOT of the server so the guest surface can stay open, exactly
// as billingModule is. Everything else lives in this module's own authenticated
// sub-scope, which registers the same auth + tenant plugins the shared protected
// scope uses, so `req.auth` and `req.business` behave identically here. Without
// that sub-scope the authenticated routes would read `req.auth` off an
// unauthenticated request.
//
// tenantPlugin is what makes the business counsellor possible: it resolves and
// validates `req.auth.orgId` into `req.business`, which services/scope.ts turns
// into the wallet a chat spends from.

import type { FastifyInstance } from "fastify";
import { authPlugin } from "../../core/plugins/auth.plugin.js";
import { tenantPlugin } from "../../core/plugins/tenant.plugin.js";
import { chatRoutes } from "./routes/chat.routes.js";
import { creditsRoutes } from "./routes/credits.routes.js";
import { guestRoutes, guestMigrateRoutes } from "./routes/guest.routes.js";

const PREFIX = "/api/v3/ai-chat";

export default async function aiChatModule(app: FastifyInstance) {
  // Unauthenticated: fingerprint-gated guest chat.
  await app.register(guestRoutes, { prefix: PREFIX });

  await app.register(async (secured) => {
    await secured.register(authPlugin);
    await secured.register(tenantPlugin);

    await secured.register(chatRoutes, { prefix: PREFIX });
    await secured.register(creditsRoutes, { prefix: PREFIX });
    await secured.register(guestMigrateRoutes, { prefix: PREFIX });
  });
}
