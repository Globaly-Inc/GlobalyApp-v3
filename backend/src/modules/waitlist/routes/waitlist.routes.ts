import type { FastifyInstance } from "fastify";
import { RegisterSchema } from "../schemas/waitlist.schema.js";
import { register } from "../services/waitlist.service.js";

export async function waitlistRoutes(app: FastifyInstance) {
  app.post("/", async (req, reply) => {
    const input = RegisterSchema.parse(req.body);
    await register(input);
    return reply.send({ ok: true });
  });
}
