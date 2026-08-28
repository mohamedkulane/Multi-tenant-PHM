import express from "express";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { expect, it } from "vitest";
import { AppError } from "../src/errors/app-error.js";
import { errorHandler } from "../src/middleware/error-handler.js";

function failingApp(problem: unknown) {
  const app = express();
  app.get("/test", (_request, response, next) => {
    response.locals.requestId = "trace-123";
    next(problem);
  });
  app.use(errorHandler);
  return app;
}
it("returns nested field paths for validation errors", async () => {
  const parsed = z
    .object({ items: z.array(z.object({ quantity: z.number().positive() })) })
    .safeParse({ items: [{ quantity: -1 }] });
  if (parsed.success) throw new Error("Fixture must fail validation");
  const response = await request(failingApp(parsed.error)).get("/test");
  expect(response.status).toBe(400);
  expect(response.body.error.details.issues[0].path).toBe("items.0.quantity");
});
it("does not expose internal messages or details for server errors", async () => {
  const response = await request(
    failingApp(
      new AppError({
        statusCode: 500,
        code: "INTERNAL_ERROR",
        message: "private database credentials",
        details: { password: "secret" },
      }),
    ),
  ).get("/test");
  expect(response.status).toBe(500);
  expect(JSON.stringify(response.body)).not.toMatch(/private|credentials|secret|password/);
  expect(response.body.requestId).toBe("trace-123");
});
it.each([
  ["P2002", 409, "DUPLICATE_RECORD"],
  ["P2003", 409, "RELATED_RECORD_CONFLICT"],
  ["P2025", 404, "RECORD_NOT_FOUND"],
  ["P2034", 409, "CONCURRENT_MODIFICATION"],
] as const)("maps %s to a safe actionable error", async (code, status, expected) => {
  const response = await request(
    failingApp(
      new Prisma.PrismaClientKnownRequestError("private SQL", { code, clientVersion: "6.19.3" }),
    ),
  ).get("/test");
  expect(response.status).toBe(status);
  expect(response.body.error.code).toBe(expected);
  expect(JSON.stringify(response.body)).not.toContain("private SQL");
});
