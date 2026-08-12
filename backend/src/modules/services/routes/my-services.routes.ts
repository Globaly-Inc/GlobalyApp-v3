import type { FastifyInstance } from "fastify";
import { BadRequestError } from "../../../shared/errors.js";
import {
  CreateListingSchema,
  UpdateListingSchema,
  ListingIdParamSchema,
  OrderIdParamSchema,
  VerifyPaymentSchema,
  DisputeSchema,
  CreateReviewSchema,
  SERVICE_CATEGORIES,
  CURRENCIES,
} from "../schemas/services.schema.js";
import * as listings from "../services/listings.service.js";
import * as orders from "../services/orders.service.js";
import * as reviews from "../services/reviews.service.js";

export async function myServicesRoutes(app: FastifyInstance) {
  // Every route here is authenticated by the global onRequest hook in auth.plugin.ts — the caller is
  // Number(req.auth.sub) and is never taken from the body.

  /** The taxonomy the form renders. Static, so the client does not hardcode a second copy of it. */
  app.get("/meta", async (_req, reply) =>
    reply.send({ categories: SERVICE_CATEGORIES, currencies: CURRENCIES }),
  );

  app.get("/summary", async (req, reply) => reply.send(await orders.summary(Number(req.auth.sub))));

  // ── Listings ──

  app.get("/listings", async (req, reply) =>
    reply.send({ listings: await listings.listMine(Number(req.auth.sub)) }),
  );

  app.post("/listings", async (req, reply) => {
    const input = CreateListingSchema.parse(req.body);
    const listing = await listings.create(Number(req.auth.sub), input);
    return reply.status(201).send(listing);
  });

  app.get("/listings/:serviceId", async (req, reply) => {
    const { serviceId } = ListingIdParamSchema.parse(req.params);
    return reply.send(await listings.getMine(serviceId, Number(req.auth.sub)));
  });

  app.patch("/listings/:serviceId", async (req, reply) => {
    const { serviceId } = ListingIdParamSchema.parse(req.params);
    const input = UpdateListingSchema.parse(req.body);
    return reply.send(await listings.update(serviceId, Number(req.auth.sub), input));
  });

  app.delete("/listings/:serviceId", async (req, reply) => {
    const { serviceId } = ListingIdParamSchema.parse(req.params);
    await listings.remove(serviceId, Number(req.auth.sub));
    return reply.status(204).send();
  });

  // Upload first, then attach the returned storage_path to the listing — keeps the create/update request
  // small JSON and lets the form preview the real uploaded object before saving.
  app.post("/listings/cover", async (req, reply) => {
    const file = await req.file();
    if (!file) throw new BadRequestError("No file uploaded");
    const uploaded = await listings.uploadCover({
      userId: Number(req.auth.sub),
      filename: file.filename,
      mimeType: file.mimetype,
      buffer: await file.toBuffer(),
    });
    return reply.status(201).send(uploaded);
  });

  // ── Orders ──

  app.get("/orders", async (req, reply) =>
    reply.send({ orders: await orders.listPurchases(Number(req.auth.sub)) }),
  );

  app.get("/received-orders", async (req, reply) =>
    reply.send({ orders: await orders.listReceived(Number(req.auth.sub)) }),
  );

  // Declared before /orders/:orderId so the literal segment is never read as an id.
  app.post("/orders/payment/verify", async (req, reply) => {
    const { session_id } = VerifyPaymentSchema.parse(req.body);
    return reply.send(await orders.verifyPayment(Number(req.auth.sub), session_id));
  });

  app.get("/orders/:orderId", async (req, reply) => {
    const { orderId } = OrderIdParamSchema.parse(req.params);
    return reply.send(await orders.getOne(orderId, Number(req.auth.sub)));
  });

  app.post("/orders/:orderId/complete", async (req, reply) => {
    const { orderId } = OrderIdParamSchema.parse(req.params);
    return reply.send(await orders.confirmCompletion(orderId, Number(req.auth.sub)));
  });

  app.post("/orders/:orderId/dispute", async (req, reply) => {
    const { orderId } = OrderIdParamSchema.parse(req.params);
    const { reason } = DisputeSchema.parse(req.body);
    return reply.send(await orders.dispute(orderId, Number(req.auth.sub), reason));
  });

  app.post("/orders/:orderId/cancel", async (req, reply) => {
    const { orderId } = OrderIdParamSchema.parse(req.params);
    return reply.send(await orders.cancel(orderId, Number(req.auth.sub)));
  });

  app.post("/orders/:orderId/refund", async (req, reply) => {
    const { orderId } = OrderIdParamSchema.parse(req.params);
    return reply.send(await orders.refund(orderId, Number(req.auth.sub)));
  });

  // ── Reviews ──

  app.get("/orders/:orderId/review", async (req, reply) => {
    const { orderId } = OrderIdParamSchema.parse(req.params);
    return reply.send({ review: await reviews.getForOrder(orderId, Number(req.auth.sub)) });
  });

  app.post("/orders/:orderId/review", async (req, reply) => {
    const { orderId } = OrderIdParamSchema.parse(req.params);
    const input = CreateReviewSchema.parse(req.body);
    const review = await reviews.create(orderId, Number(req.auth.sub), input);
    return reply.status(201).send(review);
  });
}
