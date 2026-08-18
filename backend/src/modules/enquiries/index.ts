// Enquiries module — student leads, distance-based distribution to businesses,
// and the credit-gated unlock. Wave D1.
//
// Registered inside the server's protected scope: everything here needs auth,
// and the business inbox additionally needs the tenant plugin to have resolved
// req.business.

import type { FastifyInstance } from "fastify";
import { adminEnquiriesRoutes } from "./routes/admin-enquiries.routes.js";
import { businessEnquiriesRoutes } from "./routes/business-enquiries.routes.js";
import { enquiriesRoutes } from "./routes/enquiries.routes.js";

export default async function enquiriesModule(app: FastifyInstance) {
  await app.register(enquiriesRoutes, { prefix: "/api/v3/enquiries" });
  await app.register(businessEnquiriesRoutes, { prefix: "/api/v3/business/enquiries" });
  await app.register(adminEnquiriesRoutes, { prefix: "/api/v3/admin/monitoring/enquiries" });
}
