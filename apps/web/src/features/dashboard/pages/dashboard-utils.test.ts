import { describe, expect, it } from "vitest";
import { latestDashboardRowPerPatient, type DashboardRow } from "./dashboard-utils";

describe("latestDashboardRowPerPatient", () => {
  it("shows each patient once and keeps their newest order", () => {
    const rows: DashboardRow[] = [
      {
        id: "old",
        createdAt: "2026-08-20T09:00:00.000Z",
        patient: { id: "patient-1", name: "Muno Cali Xasan" },
      },
      {
        id: "other",
        createdAt: "2026-08-21T09:00:00.000Z",
        patient: { id: "patient-2", name: "Amina Yusuf" },
      },
      {
        id: "new",
        createdAt: "2026-08-22T09:00:00.000Z",
        patient: { id: "patient-1", name: "Muno Cali Xasan" },
      },
    ];

    expect(latestDashboardRowPerPatient(rows).map((row) => row["id"])).toEqual(["new", "other"]);
  });
});
