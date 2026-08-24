import { Prisma } from "@prisma/client";
import { prisma } from "../src/database/prisma.js";
import { provisionDefaultLabCatalog } from "../src/lab/default-lab-catalog.js";

async function seedClinicDemo(slug: string) {
  const directory = await prisma.tenantLoginDirectory.findUnique({
    where: { slug },
  });

  if (!directory) {
    throw new Error(`Seed tenant '${slug}' was not found`);
  }

  await prisma.$transaction(async (transaction) => {
    // Establish tenant context for RLS-protected tenant tables.
    await transaction.$executeRaw(
      Prisma.sql`
        SELECT set_config(
          'app.tenant_id',
          ${directory.tenantId},
          true
        )
      `,
    );

    // Seed the default laboratory catalog for this tenant.
    await provisionDefaultLabCatalog(transaction, directory.tenantId);

    // Seed a demo patient for clinic/laboratory workflow testing.
    await transaction.patient.upsert({
      where: {
        tenantId_patientNumber: {
          tenantId: directory.tenantId,
          patientNumber: "PT-DEMO-001",
        },
      },

      update: {
        name: "Mohamed Ali Demo",
        sex: "MALE",
        phone: "0610000000",
        bloodGroup: "O+",
        estimatedAgeValue: 32,
        estimatedAgeUnit: "YEARS",
        notes: "Development-only clinical workflow patient",
      },

      create: {
        tenantId: directory.tenantId,
        patientNumber: "PT-DEMO-001",
        name: "Mohamed Ali Demo",
        sex: "MALE",
        phone: "0610000000",
        bloodGroup: "O+",

        estimatedAgeValue: 32,
        estimatedAgeUnit: "YEARS",

        notes: "Development-only clinical workflow patient",
      },
    });
  });
}

async function seedPlatformSettings() {
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

  await prisma.$transaction(async (transaction) => {
    // Platform settings are protected by a database trigger.
    // Authorize this transaction as a platform workflow.
    await transaction.$executeRaw(
      Prisma.sql`
        SELECT set_config(
          'app.platform_admin',
          'true',
          true
        )
      `,
    );

    await transaction.platformSetting.upsert({
      where: {
        key: "platform.version",
      },

      update: {
        value: version,
      },

      create: {
        key: "platform.version",
        value: version,
      },
    });
  });
}

async function seed() {
  console.log("Starting PHMS database seed...");

  await seedPlatformSettings();

  console.log("Platform settings seeded.");

  const demoTenantSlug = process.env.PHMS_SEED_TENANT_SLUG?.trim();

  if (demoTenantSlug) {
    console.log(`Seeding clinic demo data for tenant: ${demoTenantSlug}`);

    await seedClinicDemo(demoTenantSlug);

    console.log(`Clinic demo data seeded for tenant: ${demoTenantSlug}`);
  } else {
    console.log("PHMS_SEED_TENANT_SLUG is not set; skipping tenant demo seed.");
  }

  console.log("PHMS database seed completed successfully.");
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error("PHMS database seed failed:");
    console.error(error);

    await prisma.$disconnect();

    process.exitCode = 1;
  });
