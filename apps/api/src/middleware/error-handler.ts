import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error.js";
import { logger } from "../lib/logger.js";

interface ResponseLocals {
  requestId?: string;
}

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  void next;
  const locals = response.locals as ResponseLocals;
  const requestId = locals.requestId;

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "The request could not be validated",
        details: error.flatten(),
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
        ...(error.details === undefined ? {} : { details: error.details }),
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
