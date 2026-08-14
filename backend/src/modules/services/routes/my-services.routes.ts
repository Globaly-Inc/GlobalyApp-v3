import type { FastifyInstance } from "fastify";
import { BadRequestError } from "../../../shared/errors.js";
import * as storage from "../../../shared/storage/storageService.js";
import {
  CreateListingSchema,
  UpdateListingSchema,
  ListingIdParamSchema,
  OrderIdParamSchema,
  VerifyPaymentSchema,
  DisputeSchema,
  CreateReviewSchema,
  CreateOrderSchema,
  SendMessageSchema,
  CURRENCIES,
} from "../schemas/services.schema.js";
import * as publicServices from "../services/public-services.service.js";
import * as listings from "../services/listings.service.js";
import * as orders from "../services/orders.service.js";
import * as reviews from "../services/reviews.service.js";
import { isConfigured as paymentsConfigured } from "../payments/index.js";

export async function myServicesRoutes(app: FastifyInstance) {
  // Every route here is authenticated by the global onRequest hook in auth.plugin.ts — the caller is always
  // Number(req.auth.sub) and is never taken from the body.

  /**
   * Static config the form needs, plus what this environment can actually do. `cover_upload_available` lets
   * the form hide the image affordance instead of offering a button that can only fail — the same approach
   * the feed composer takes with its AI availability probe.
   */
  app.get("/meta", async (_req, reply) =>
    reply.send({
      // The fixed list a seller must choose from: personal-scope rows of service_categories. Only an admin
      // can add to it, and one added there shows up in this form without a deploy.
      categories: await publicServices.categories(),
      currencies: CURRENCIES,
      cover_upload_available: storage.isConfigured(),
      payments_live: paymentsConfigured(),
    }),
  );

  app.get("/summary", async (req, reply) => reply.send(await orders.summary(Number(req.auth.sub))));

  // ── Listings ──

  app.get("/listings", async (req, reply) =>
    reply.send({ listings: await listings.listMine(Number(req.auth.sub)) }),
  );

  app.post("/listings", async (req, reply) => {
    const input = CreateListingSchema.parse(req.body);
    return reply.status(201).send(await listings.create(Number(req.auth.sub), input));
  });

  // Upload first, then attach the returned storage_path to the listing — keeps create/update a small JSON
  // request and lets the form preview the real uploaded object before saving. Declared before
  // /listings/:serviceId so "cover" is never read as an id.
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

  // ── Orders ──

  /** Place an order. The buyer sends a listing id; price and provider come from the listing. */
  app.post("/orders", async (req, reply) => {
    const input = CreateOrderSchema.parse(req.body);
    const order = await orders.createOrder(Number(req.auth.sub), input);
    return reply.status(201).send(order);
  });

  /** Start payment. Returns somewhere to pay — the provider's page, or the dev driver's return URL. */
  app.post("/orders/:orderId/checkout", async (req, reply) => {
    const { orderId } = OrderIdParamSchema.parse(req.params);
    const result = await orders.startCheckout(orderId, Number(req.auth.sub), req.auth.email ?? null);
    return reply.send(result);
  });

  app.get("/orders", async (req, reply) =>
    reply.send({ orders: await orders.listPurchases(Number(req.auth.sub)) }),
  );

  app.get("/received-orders", async (req, reply) =>
    reply.send({ orders: await orders.listReceived(Number(req.auth.sub)) }),
  );

  // Declared before /orders/:orderId so the literal segments are never read as an id.
  app.post("/orders/payment/verify", async (req, reply) => {
    const { session_id } = VerifyPaymentSchema.parse(req.body);
    return reply.send(await orders.verifyPayment(Number(req.auth.sub), session_id));
  });

  app.get("/orders/:orderId", async (req, reply) => {
    const { orderId } = OrderIdParamSchema.parse(req.params);
    return reply.send(await orders.getOne(orderId, Number(req.auth.sub)));
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

  // ── Order messages ──
  //
  // The post-purchase conversation. Scoped to one order rather than a general inbox — V3 has no messaging
  // module, and a thread that already knows both participants needs no contact list.

  app.get("/orders/:orderId/messages", async (req, reply) => {
    const { orderId } = OrderIdParamSchema.parse(req.params);
    return reply.send({ messages: await orders.listMessages(orderId, Number(req.auth.sub)) });
  });

  app.post("/orders/:orderId/messages", async (req, reply) => {
    const { orderId } = OrderIdParamSchema.parse(req.params);
    const { body } = SendMessageSchema.parse(req.body);
    return reply.status(201).send(await orders.sendMessage(orderId, Number(req.auth.sub), body));
  });

  // ── Reviews ──
  //
  // Keyed on the listing, not the order: reviewing no longer requires having bought. Authenticated because
  // the reviewer is attributed and limited to one per listing — see reviews.service.

  app.get("/listings/:serviceId/my-review", async (req, reply) => {
    const { serviceId } = ListingIdParamSchema.parse(req.params);
    return reply.send(await reviews.myReviewFor(serviceId, Number(req.auth.sub)));
  });

  app.post("/listings/:serviceId/reviews", async (req, reply) => {
    const { serviceId } = ListingIdParamSchema.parse(req.params);
    const input = CreateReviewSchema.parse(req.body);
    return reply.status(201).send(await reviews.create(serviceId, Number(req.auth.sub), input));
  });
}
