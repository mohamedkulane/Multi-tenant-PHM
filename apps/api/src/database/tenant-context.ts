import { Prisma, type PrismaClient } from "@prisma/client";

export interface TenantTransactionContext {
  tenantId: string;
  userId?: string;
  membershipId?: string;
  branchId?: string;
}

type TransactionClient = Prisma.TransactionClient;

async function setOptionalContext(
  transaction: TransactionClient,
  key: "app.user_id" | "app.membership_id" | "app.branch_id",
  value: string | undefined,
) {
  await transaction.$queryRaw(Prisma.sql`SELECT set_config(${key}, ${value ?? ""}, true)`);
}

export async function setTransactionContext(
  transaction: TransactionClient,
  context: TenantTransactionContext,
) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT set_config('app.tenant_id', ${context.tenantId}, true)`,
  );
  await setOptionalContext(transaction, "app.user_id", context.userId);
  await setOptionalContext(transaction, "app.membership_id", context.membershipId);
  await setOptionalContext(transaction, "app.branch_id", context.branchId);
}

export async function withTenantContext<T>(
  client: PrismaClient,
  context: TenantTransactionContext,
  operation: (transaction: TransactionClient) => Promise<T>,
) {
  return client.$transaction(async (transaction) => {
    await setTransactionContext(transaction, context);
    return operation(transaction);
  });
}
