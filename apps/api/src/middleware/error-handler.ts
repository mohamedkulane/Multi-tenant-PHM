import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/app-error.js";
import { logger } from "../lib/logger.js";
import { UNSUPPORTED_PAYMENT_METHOD_MESSAGE } from "../payments/payment-methods.js";

interface ResponseLocals {
  requestId?: string;
}

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  void next;
  const locals = response.locals as ResponseLocals;
  const requestId = locals.requestId;

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const problems: Record<string, { status: number; code: string; message: string }> = {
      P2002: {
        status: 409,
        code: "DUPLICATE_RECORD",
        message:
          "A record with these details already exists. Check the existing record or use different details.",
      },
      P2003: {
        status: 409,
        code: "RELATED_RECORD_CONFLICT",
        message:
          "This record is linked to other records, or a selected record no longer exists. Refresh your selection; archive linked records instead of deleting them.",
      },
      P2025: {
        status: 404,
        code: "RECORD_NOT_FOUND",
        message: "This record no longer exists. Refresh the page and select another record.",
      },
      P2034: {
        status: 409,
        code: "CONCURRENT_MODIFICATION",
        message:
          "Another request changed this record. Refresh and review the latest details before trying again.",
      },
    };
    const problem = problems[error.code];
    if (problem) {
      response
        .status(problem.status)
        .json({ error: { code: problem.code, message: problem.message }, requestId });
      return;
    }
  }

  if (error instanceof ZodError) {
    const unsupportedPaymentMethod = error.issues.some(
      (issue) => issue.message === UNSUPPORTED_PAYMENT_METHOD_MESSAGE,
    );
    response.status(400).json({
      error: {
        code: unsupportedPaymentMethod ? "UNSUPPORTED_PAYMENT_METHOD" : "VALIDATION_FAILED",
        message: unsupportedPaymentMethod
          ? UNSUPPORTED_PAYMENT_METHOD_MESSAGE
          : "The request could not be validated",
        details: {
          ...error.flatten(),
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      requestId,
    });
    return;
  }

  if (error instanceof Error && error.message.includes("PLAN_LIMIT_EXCEEDED:")) {
    const limit = /PLAN_LIMIT_EXCEEDED:([A-Za-z0-9]+)/.exec(error.message)?.[1];
    response.status(409).json({
      error: {
        code: "PLAN_LIMIT_EXCEEDED",
        message: "The tenant plan limit has been reached",
        ...(limit ? { details: { limit } } : {}),
      },
      requestId,
    });
    return;
  }
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error({ err: error, requestId, path: request.path }, error.message);
    }

    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.statusCode >= 500 ? "An unexpected error occurred" : error.message,
        ...(error.statusCode >= 500 || error.details === undefined
          ? {}
          : { details: error.details }),
      },
      requestId,
    });
    return;
  }

  logger.error({ err: error, requestId, path: request.path }, "Unhandled request error");

  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
    requestId,
  });
};
