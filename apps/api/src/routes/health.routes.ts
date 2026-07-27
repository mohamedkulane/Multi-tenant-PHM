import { Router } from "express";
import type { ReadinessResult } from "../database/readiness.js";

export type ReadinessCheck = () => Promise<ReadinessResult>;

interface ResponseLocals {
  requestId?: string;
}

export function createHealthRouter(readinessCheck: ReadinessCheck) {
  const router = Router();

  router.get("/live", (_request, response) => {
    const locals = response.locals as ResponseLocals;
    response.json({
      data: {
        status: "up",
        service: "phms-api",
        timestamp: new Date().toISOString(),
      },
      requestId: locals.requestId,
    });
  });

  router.get("/ready", async (_request, response) => {
    const locals = response.locals as ResponseLocals;

    try {
      const readiness = await readinessCheck();
      response.json({
        data: {
          status: "ready",
          ...readiness,
        },
        requestId: locals.requestId,
      });
    } catch {
      response.status(503).json({
        error: {
          code: "SERVICE_NOT_READY",
          message: "The API is running but a required dependency is unavailable",
        },
        requestId: locals.requestId,
      });
    }
  });

  return router;
}
