import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

export interface PlatformMailer {
  assertConfigured(): void;
  send(to: string, subject: string, text: string): Promise<void>;
}

export const platformMailer: PlatformMailer = {
  assertConfigured() {
    if (
      !env.SMTP_HOST ||
      !env.SMTP_USER ||
      !env.SMTP_PASSWORD ||
      !env.SMTP_FROM ||
      !env.PLATFORM_WEB_URL ||
      (env.NODE_ENV === "production" && !env.PLATFORM_WEB_URL.startsWith("https://"))
    ) {
      throw new AppError({
        statusCode: 503,
        code: "EMAIL_DELIVERY_UNAVAILABLE",
        message:
          "Configure platform SMTP and the public HTTPS web URL before requesting email links.",
      });
    }
  },
  async send(to, subject, text) {
    this.assertConfigured();
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      requireTLS: !env.SMTP_SECURE,
      auth: { user: env.SMTP_USER!, pass: env.SMTP_PASSWORD! },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    await transport.sendMail({ from: env.SMTP_FROM!, to, subject, text });
  },
};
