import { config } from "../../config.js";

export interface MailerConfig {
  host: string | undefined;
  port: number;
  user: string | undefined;
  pass: string | undefined;
  defaultFrom: string;
}

export const mailerConfig: MailerConfig = {
  host: config.SMTP_HOST,
  port: config.MAIL_PORT,
  user: config.MAIL_USERNAME,
  pass: config.MAIL_PASSWORD,
  defaultFrom: "noreply@globalyhub.com",
};
