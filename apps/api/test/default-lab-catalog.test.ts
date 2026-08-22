import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { defaultLabTests, provisionDefaultLabCatalog } from "../src/lab/default-lab-catalog.js";

describe("default laboratory catalog", () => {
  it("provisions at least five active tests for a tenant", async () => {
    const categoryUpsert = vi.fn().mockResolvedValue({ id: "category-1" });
    const testUpsert = vi.fn().mockResolvedValue({});
    const transaction = {
      labCategory: { upsert: categoryUpsert },
      labTest: { upsert: testUpsert },
    } as unknown as Prisma.TransactionClient;

    const result = await provisionDefaultLabCatalog(transaction, "tenant-1");

    expect(defaultLabTests.length).toBeGreaterThanOrEqual(5);
    expect(result.testsCreatedOrUpdated).toBe(defaultLabTests.length);
    expect(categoryUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_name: { tenantId: "tenant-1", name: "General Laboratory" } },
      }),
    );
    expect(testUpsert).toHaveBeenCalledTimes(7);
    const upserts = testUpsert.mock.calls as unknown as Array<
      [{ create: { code: string }; update: { active: boolean } }]
    >;
    expect(upserts.map(([call]) => call.create.code)).toEqual([
      "MAL-RDT",
      "CBC",
      "TYPHOID",
      "UA",
      "RBS",
      "CRP",
      "HCG",
    ]);
    expect(upserts.every(([call]) => call.update.active === true)).toBe(true);
  });
});
