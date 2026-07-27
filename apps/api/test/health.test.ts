import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("health routes", () => {
  it("reports liveness without requiring the database", async () => {
    const response = await request(
      createApp({
        readinessCheck: () =>
          Promise.resolve({
            database: "up",
            checkedAt: new Date().toISOString(),
          }),
      }),
    ).get("/api/v1/health/live");

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("up");
    expect(response.body.requestId).toEqual(expect.any(String));
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
  });

  it("reports readiness when required dependencies are available", async () => {
    const response = await request(
      createApp({
        readinessCheck: () =>
          Promise.resolve({
            database: "up",
            checkedAt: "2026-07-26T00:00:00.000Z",
          }),
      }),
    ).get("/api/v1/health/ready");

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: "ready",
      database: "up",
    });
  });

  it("returns a safe 503 response when a required dependency is unavailable", async () => {
    const response = await request(
      createApp({
        readinessCheck: () => Promise.reject(new Error("database password must never leak")),
      }),
    ).get("/api/v1/health/ready");

    expect(response.status).toBe(503);
    expect(response.body.error).toEqual({
      code: "SERVICE_NOT_READY",
      message: "The API is running but a required dependency is unavailable",
    });
    expect(JSON.stringify(response.body)).not.toContain("password");
  });

  it("returns a consistent not-found error", async () => {
    const response = await request(createApp()).get("/not-a-route");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
    expect(response.body.requestId).toEqual(expect.any(String));
  });
});
