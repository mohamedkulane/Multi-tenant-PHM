import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";
import { errorMessage, fieldErrors } from "./client";

function apiError(status: number, code: string, message = "", details?: unknown) {
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "Error",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { error: { code, message, details }, requestId: "support-123" },
  });
}
describe("actionable error messages", () => {
  it("explains platform login failure and recovery", () => {
    expect(errorMessage(apiError(401, "INVALID_PLATFORM_CREDENTIALS"))).toContain(
      "Forgot password",
    );
  });
  it("keeps useful business rule messages instead of swallowing them", () => {
    expect(
      errorMessage(
        apiError(409, "INSUFFICIENT_STOCK", "Paracetamol does not have enough unexpired stock"),
      ),
    ).toContain("Paracetamol");
  });
  it("identifies nested validation fields", () => {
    const error = apiError(400, "VALIDATION_FAILED", "", {
      issues: [{ path: "items.0.quantity", message: "Must be greater than zero" }],
    });
    expect(fieldErrors(error)).toEqual({ "items.0.quantity": "Must be greater than zero" });
    expect(errorMessage(error)).toContain("Items 1: quantity: Must be greater than zero");
  });
  it("never exposes internal server messages or details", () => {
    const error = apiError(500, "INTERNAL_ERROR", "Prisma connection password=secret", {
      issues: [{ path: "sql", message: "private" }],
    });
    expect(errorMessage(error)).not.toMatch(/Prisma|secret|private/);
    expect(errorMessage(error)).toContain("support-123");
    expect(fieldErrors(error)).toEqual({});
  });
  it("explains rate limiting and timeouts without suggesting duplicate payments", () => {
    expect(errorMessage(apiError(429, "RATE_LIMITED"))).toContain("Sug");
    expect(errorMessage(new AxiosError("timeout", "ECONNABORTED"))).toContain(
      "hubi inay kaydsantay",
    );
  });
  it("explains missing email configuration safely", () => {
    expect(errorMessage(apiError(503, "EMAIL_DELIVERY_UNAVAILABLE"))).toContain("SMTP");
  });
});
