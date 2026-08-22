import { Prisma } from "@prisma/client";
import { prisma } from "../src/database/prisma.js";
import { provisionDefaultLabCatalog } from "../src/lab/default-lab-catalog.js";

async function seedLabCatalogs() {
  const tenants = await prisma.tenantLoginDirectory.findMany({
    select: { tenantId: true, slug: true },
    orderBy: { slug: "asc" },
  });

  for (const tenant of tenants) {
    await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT set_config('app.tenant_id', ${tenant.tenantId}, true)`,
      );
      await provisionDefaultLabCatalog(transaction, tenant.tenantId);
    });
    console.info(`Seeded 7 laboratory tests for tenant '${tenant.slug}'.`);
  }
}

seedLabCatalogs()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
