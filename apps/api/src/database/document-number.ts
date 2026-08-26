import { Prisma } from "@prisma/client";

export async function nextDocumentNumber(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  kind: "PATIENT" | "CLINIC_VISIT" | "LAB_ORDER",
  prefix: "PT/P" | "VIS/V" | "LAB/L",
) {
  const values = await transaction.$queryRaw<Array<{ current_value: bigint }>>(Prisma.sql`
    INSERT INTO public.tenant_document_counters (tenant_id, kind, current_value)
    VALUES (${tenantId}::uuid, ${kind}, 1)
    ON CONFLICT (tenant_id, kind)
    DO UPDATE SET current_value = public.tenant_document_counters.current_value + 1,
                  updated_at = now()
    RETURNING current_value
  `);
  const value = values[0]?.current_value;
  if (value === undefined) throw new Error("Document number counter did not return a value");
  return `${prefix}${value.toString().padStart(4, "0")}`;
}
