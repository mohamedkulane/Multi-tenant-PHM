import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: "phms-api",
    environment: env.NODE_ENV,
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "*.password",
      "*.passwordHash",
      "*.sessionToken",
      "*.resetToken",
      "*.token",
      "*.confirmPassword",
      "*.SMTP_PASSWORD",
    ],
    censor: "[REDACTED]",
  },
});
