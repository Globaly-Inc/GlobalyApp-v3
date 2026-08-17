import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { createChildLogger } from "../logger.js";
import { mailerConfig, MailerConfig } from "./mailerConfig.js";

const logger = createChildLogger("mailer-service");

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

class MailerService {
  private transporter: Transporter | null;
  private config: MailerConfig;

  constructor(config: MailerConfig) {
    this.config = config;
    this.transporter = config.host
      ? nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.port === 465,
          auth: config.user ? { user: config.user, pass: config.pass } : undefined,
        })
      : null;
  }

  async sendMail(options: EmailOptions): Promise<void> {
    if (!this.transporter) {
      logger.info(`[DEV] to=${options.to} subject="${options.subject}"`);
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.config.defaultFrom,
        to: options.to,
        subject: options.subject,
        // Send both parts when we have them: a multipart mail scores better with spam filters than
        // an HTML-only one, and text-only clients get something readable instead of raw markup.
        ...(options.html ? { html: options.html } : {}),
        ...(options.text || !options.html ? { text: options.text ?? "" } : {}),
      });

      logger.info(`Email sent to: ${options.to}`, { messageId: info.messageId });
    } catch (error) {
      logger.error("Failed to send email", { to: options.to, error });
      throw new Error("Failed to send email");
    }
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      logger.warn("No SMTP configured — emails will be logged to console");
      return false;
    }

    try {
      await this.transporter.verify();
      logger.info("SMTP connection verified");
      return true;
    } catch (error) {
      logger.error("SMTP connection error", { error });
      return false;
    }
  }
}

export const mailerService = new MailerService(mailerConfig);

export default mailerService;
