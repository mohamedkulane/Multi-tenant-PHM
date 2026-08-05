import { describe, expect, it } from "vitest";
import {
  ensureReceivableExpiry,
  serializeInventoryMovement,
} from "../src/inventory/inventory.service.js";

describe("inventory receipt expiry validation", () => {
  const now = new Date("2026-07-29T12:00:00.000Z");

  it("accepts stock expiring on the current business date", () => {
    expect(() => ensureReceivableExpiry(new Date("2026-07-29"), now)).not.toThrow();
  });

  it("accepts stock with a future expiry date", () => {
    expect(() => ensureReceivableExpiry(new Date("2030-12-31"), now)).not.toThrow();
  });

  it("rejects already expired stock", () => {
    expect(() => ensureReceivableExpiry(new Date("2026-07-28"), now)).toThrowError(
      expect.objectContaining({ code: "EXPIRY_DATE_IN_PAST" }),
    );
  });
});
describe("inventory movement serialization", () => {
  it("converts every BigInt response field used by Movement History", () => {
    const serialized = serializeInventoryMovement({
      id: 42n,
      quantityDelta: -10n,
      balanceAfter: 90n,
      type: "SALE",
    });

    expect(serialized).toMatchObject({
      id: "42",
      quantityDelta: "-10",
      balanceAfter: "90",
      type: "SALE",
    });
    expect(() => JSON.stringify(serialized)).not.toThrow();
  });
});
