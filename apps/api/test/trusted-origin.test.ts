import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { requireTrustedMutationOrigin, trustedWebOrigins } from "../src/security/trusted-origin.js";

function app() {
  const server = express();
  server.use(express.json());
  trustedWebOrigins.add("https://phms.example");
  server.use(requireTrustedMutationOrigin);
  server.post("/mutation", (_request, response) => response.status(204).end());
  server.use(
    (
      error: { statusCode?: number; code?: string },
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => response.status(error.statusCode ?? 500).json({ error: { code: error.code } }),
  );
  return server;
}

describe("trusted origin guard", () => {
  it("accepts a cookie-authenticated mutation from an allowlisted origin", async () => {
    const response = await request(app())
      .post("/mutation")
      .set("Cookie", "phms_session=test")
      .set("Origin", "https://phms.example")
      .send({ value: true });
    expect(response.status).toBe(204);
  });

  it("rejects a cookie-authenticated mutation from an untrusted origin", async () => {
    const response = await request(app())
      .post("/mutation")
      .set("Cookie", "phms_session=test")
      .set("Origin", "https://evil.example")
      .send({ value: true });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("UNTRUSTED_MUTATION_ORIGIN");
  });
});
