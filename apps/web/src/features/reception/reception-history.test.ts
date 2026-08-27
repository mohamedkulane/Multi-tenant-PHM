import { expect, it, vi, beforeEach } from "vitest";
import { getData } from "../../api/client";
import { loadReceptionHistory } from "./reception-visits";
vi.mock("../../api/client", () => ({ getData: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it("loads more than 300 visits in bounded pages", async () => {
  vi.mocked(getData).mockImplementation((url) => {
    const page = Number(new URL(url, "http://localhost").searchParams.get("page"));
    return Promise.resolve(
      Array.from({ length: page < 3 ? 100 : 1 }, (_, index) => ({
        id: String(page * 100 + index),
      })),
    );
  });
  expect(await loadReceptionHistory("branch")).toHaveLength(301);
  expect(getData).toHaveBeenCalledTimes(4);
});
it("rejects a repeated full page rather than returning incomplete history or looping forever", async () => {
  vi.mocked(getData).mockResolvedValue(
    Array.from({ length: 100 }, (_, index) => ({ id: String(index) })),
  );
  await expect(loadReceptionHistory("branch")).rejects.toThrow("completely");
  expect(getData).toHaveBeenCalledTimes(2);
});
