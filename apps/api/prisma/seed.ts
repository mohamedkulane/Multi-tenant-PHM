import { Prisma } from "@prisma/client";
import { prisma } from "../src/database/prisma.js";
import { provisionDefaultLabCatalog } from "../src/lab/default-lab-catalog.js";

async function seedClinicDemo(slug: string) {
  const directory = await prisma.tenantLoginDirectory.findUnique({ where: { slug } });
  if (!directory) throw new Error(`Seed tenant '${slug}' was not found`);
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw(
      Prisma.sql`SELECT set_config('app.tenant_id', ${directory.tenantId}, true)`,
    );
    await provisionDefaultLabCatalog(transaction, directory.tenantId);
    await transaction.patient.upsert({
      where: {
        tenantId_patientNumber: { tenantId: directory.tenantId, patientNumber: "PT-DEMO-001" },
      },
      update: {},
      create: {
        tenantId: directory.tenantId,
        patientNumber: "PT-DEMO-001",
        name: "Mohamed Ali Demo",
        age: 32,
        sex: "MALE",
        phone: "0610000000",
        bloodGroup: "O+",
        notes: "Development-only clinical workflow patient",
      },
    });
  });
}

async function seed() {
  const version = {
    milestone: "M8",
    databaseIsolation: "postgresql-rls",
    inventoryLedger: "immutable-batch-ledger",
    financeLedger: "transactional-sales-payments-and-reversals",
    reporting: "tenant-safe-postgresql-read-models",
    jobs: "durable-postgresql-outbox",
    platformAdministration: "separate-platform-auth-and-audited-support",
    plans: "database-enforced-tenant-limits",
    frontend: "tenant-and-platform-operational-workspaces",
    migrationReadiness: "checksum-validation-backup-load-and-rollback",
    rolloutReadiness: "pilot-slo-incident-and-phased-gates",
    clinicalWorkflow: "reception-doctor-laboratory-pharmacy",
  };

  await prisma.platformSetting.upsert({
    where: { key: "platform.version" },
    update: { value: version },
    create: { key: "platform.version", value: version },
  });

  const demoTenantSlug = process.env.PHMS_SEED_TENANT_SLUG?.trim();
  if (demoTenantSlug) await seedClinicDemo(demoTenantSlug);
}

seed()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
