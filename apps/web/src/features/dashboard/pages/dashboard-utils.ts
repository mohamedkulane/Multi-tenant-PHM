export type DashboardRow = Record<string, unknown>;

export const dashboardText = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

export const dashboardRows = (value: unknown): DashboardRow[] =>
  Array.isArray(value) ? (value as DashboardRow[]) : [];

export function dashboardPatient(row: DashboardRow) {
  return (row["patient"] as DashboardRow | undefined) ?? {};
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
