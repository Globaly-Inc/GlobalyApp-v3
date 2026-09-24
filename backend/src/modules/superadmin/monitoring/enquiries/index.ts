// Enquiries sub-module — register routes with no prefix (parent sets it).

import type { FastifyInstance } from "fastify";
import { adminEnquiryRoutes } from "./routes/enquiries.routes.js";

export default async function enquiriesModule(app: FastifyInstance) {
  app.register(adminEnquiryRoutes);
}
