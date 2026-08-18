// Public certificate verification. Registered at the server root, outside the
// auth plugin: the point of a verification code is that anyone holding it can
// check the credential without an account.
//
// The response projection lives in certificates.service.verifyCertificate and is
// deliberately narrow — see the header there.

import type { FastifyInstance } from "fastify";
import { VerificationCodeParamSchema } from "../schemas/training.schema.js";
import * as service from "../services/certificates.service.js";

export async function publicCertificateRoutes(app: FastifyInstance) {
  app.get(
    "/verify/:code",
    {
      // A verifier is an anonymous, guessable-by-brute-force surface. Rate limit
      // it harder than the global default so the code space cannot be swept.
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const { code } = VerificationCodeParamSchema.parse(req.params);
      return reply.send(await service.verifyCertificate(code));
    },
  );
}
