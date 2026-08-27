import { config } from "../../config.js";

export interface MailerConfig {
  host: string | undefined;
  port: number;
  user: string | undefined;
  pass: string | undefined;
  defaultFrom: string;
}

export const mailerConfig: MailerConfig = {
  host: config.MAIL_HOST,
  port: config.MAIL_PORT,
  user: config.MAIL_USERNAME,
  pass: config.MAIL_PASSWORD,
  // With a display name: a mail client shows the address verbatim when there isn't one, so
  // every mail the platform sends was arriving from "noreply@globalyapp.com" rather than
  // from Globaly. Applies to OTP, invitations and enquiry notices alike.
  defaultFrom: "Globaly <noreply@globalyapp.com>",
};
