export type DashboardRow = Record<string, unknown>;

export const dashboardText = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

export const dashboardRows = (value: unknown): DashboardRow[] =>
  Array.isArray(value) ? (value as DashboardRow[]) : [];

export function dashboardPatient(row: DashboardRow) {
  return (row["patient"] as DashboardRow | undefined) ?? {};
}

function timestamp(value: unknown) {
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Keeps the newest dashboard row for each patient without changing full order history. */
export function latestDashboardRowPerPatient(rows: DashboardRow[]) {
  const seen = new Set<string>();
  return [...rows]
    .sort((left, right) => timestamp(right["createdAt"]) - timestamp(left["createdAt"]))
    .filter((row) => {
      const patient = dashboardPatient(row);
      const patientKey =
        dashboardText(patient["id"]) ||
        dashboardText(patient["patientNumber"]) ||
        [patient["name"], patient["age"], patient["sex"]]
          .map((value) => dashboardText(value).trim().toLowerCase())
          .filter(Boolean)
          .join("|") ||
        `visit:${dashboardText(row["id"])}`;
      if (seen.has(patientKey)) return false;
      seen.add(patientKey);
      return true;
    });
}

export function isToday(value: unknown) {
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") {
    return false;
  }
  const date = new Date(value);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export function shortTime(value: unknown) {
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}

export function elapsedMinutes(value: unknown) {
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
}
