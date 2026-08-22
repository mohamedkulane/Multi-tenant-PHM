export type ClinicalRow = Record<string, unknown>;

export const clinicalRows = (value: unknown): ClinicalRow[] =>
  Array.isArray(value) ? (value as ClinicalRow[]) : [];

export const clinicalText = (value: unknown, fallback = "—") =>
  typeof value === "string" || typeof value === "number" ? String(value) : fallback;
