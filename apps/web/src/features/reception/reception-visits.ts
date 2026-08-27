import { getData } from "../../api/client";
type Row = Record<string, unknown>;
/** Read history in bounded batches instead of silently stopping at the queue limit. */
export async function loadReceptionHistory(branchId: string) {
  const visits = new Map<string, Row>();
  for (let page = 0; page <= 10000; page += 1) {
    const batch = await getData<Row[]>(
      `/clinic/visits?branchId=${encodeURIComponent(branchId)}&page=${page}`,
    );
    let added = 0;
    for (const visit of batch) {
      const id = typeof visit["id"] === "string" ? visit["id"] : "";
      if (id && !visits.has(id)) {
        visits.set(id, visit);
        added += 1;
      }
    }
    if (batch.length < 100) return [...visits.values()];
    if (!added) throw new Error("Visit history could not be loaded completely. Please retry.");
  }
  throw new Error("Visit history is too large to load. Contact your administrator.");
}
const str = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
const labs = (visit: Row) =>
  Array.isArray(visit["labVisits"]) ? (visit["labVisits"] as Row[]) : [];
export const hasPaidLabReceipt = (visit: Row) =>
  labs(visit).some(
    (lab) =>
      lab["total"] != null &&
      lab["amountPaid"] != null &&
      Number.isFinite(Number(lab["total"])) &&
      Number(lab["amountPaid"]) >= Number(lab["total"]),
  );
export function receptionVisitStatus(visit: Row) {
  const status = str(visit["status"]);
  if (
    status === "AWAITING_LAB_PAYMENT" ||
    status === "AWAITING_CONSULTATION_PAYMENT" ||
    status === "CANCELLED"
  )
    return status;
  if (hasPaidLabReceipt(visit)) return "LAB PAYMENT CLEARED";
  if (
    ["LAB_RESULTS_READY", "RESULTS_READY", "DOCTOR_REVIEW", "AT_PHARMACY", "COMPLETED"].includes(
      status,
    )
  )
    return "RECEPTION COMPLETE";
  return status;
}
export function filterReceptionVisits(
  visits: Row[],
  search: string,
  date: string,
  timezone?: string,
) {
  const query = search.trim().toLowerCase();
  return visits.filter((visit) => {
    const patient = (visit["patient"] ?? {}) as Row;
    const matches = [patient["name"], patient["patientNumber"], visit["visitNumber"]].some(
      (value) => str(value).toLowerCase().includes(query),
    );
    if (!matches || !date) return matches;
    const created = new Date(String(visit["createdAt"]));
    if (!Number.isFinite(created.getTime())) return false;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone ?? "Africa/Nairobi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(created);
    const part = (type: string) => parts.find((item) => item.type === type)?.value;
    return [part("year"), part("month"), part("day")].join("-") === date;
  });
}
