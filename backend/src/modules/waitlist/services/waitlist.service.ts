import { queueEmail } from "../../auth/auth.service.js";
import { waitlistConfirmationEmail } from "../../../shared/mail/templates.js";
import { createChildLogger } from "../../../shared/logger.js";
import { ConflictError } from "../../../shared/errors.js";
import * as repo from "../repositories/waitlist.repository.js";
import type { RegisterInput } from "../schemas/waitlist.schema.js";

const logger = createChildLogger("waitlist-service");

export async function register(input: RegisterInput): Promise<void> {
  const email = input.email.toLowerCase();
  const inserted = await repo.insertIgnoreDup({ name: input.name, email, registrant_type: input.type });

  // The same email may register under a different registrant_type, but an
  // exact repeat of this (email, type) pair is a conflict, not a silent no-op.
  if (!inserted) {
    throw new ConflictError(`You're already registered as ${input.type}.`);
  }

  const { subject, html } = waitlistConfirmationEmail(input.name, input.type);
  queueEmail({ to: email, subject, html }).catch((err) =>
    logger.error("waitlist confirmation email failed", { err }),
  );
}
