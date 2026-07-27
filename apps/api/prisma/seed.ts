import { prisma } from "../src/database/prisma.js";

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
  };

  await prisma.platformSetting.upsert({
    where: { key: "platform.version" },
    update: { value: version },
    create: {
      key: "platform.version",
      value: version,
    },
  });
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
