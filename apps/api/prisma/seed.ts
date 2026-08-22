import { Prisma } from "@prisma/client";
import { prisma } from "../src/database/prisma.js";

const demoTests = [
  {
    code: "MAL",
    name: "Malaria Test",
    price: "2.00",
    sampleType: "Blood",
    resultType: "POSITIVE_NEGATIVE" as const,
  },
  {
    code: "HIV",
    name: "HIV Screening",
    price: "3.00",
    sampleType: "Blood",
    resultType: "POSITIVE_NEGATIVE" as const,
  },
  {
    code: "RBS",
    name: "Random Blood Sugar",
    price: "2.50",
    sampleType: "Blood",
    resultType: "NUMERIC" as const,
    unit: "mg/dL",
    referenceRange: "70-140 mg/dL",
  },
  {
    code: "UA",
    name: "Urinalysis",
    price: "3.00",
    sampleType: "Urine",
    resultType: "TEXT" as const,
  },
  {
    code: "CBC",
    name: "Complete Blood Count",
    price: "5.00",
    sampleType: "Blood",
    resultType: "PANEL" as const,
    panelComponents: [
      { name: "WBC", unit: "10^9/L", referenceRange: "4.0-11.0" },
      { name: "RBC", unit: "10^12/L", referenceRange: "4.2-5.9" },
      { name: "Hemoglobin", unit: "g/dL", referenceRange: "12.0-17.5" },
      { name: "Platelets", unit: "10^9/L", referenceRange: "150-450" },
    ],
  },
];

async function seedClinicDemo(slug: string) {
  const directory = await prisma.tenantLoginDirectory.findUnique({ where: { slug } });
  if (!directory) throw new Error(`Seed tenant '${slug}' was not found`);
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw(
      Prisma.sql`SELECT set_config('app.tenant_id', ${directory.tenantId}, true)`,
    );
    const category = await transaction.labCategory.upsert({
      where: { tenantId_name: { tenantId: directory.tenantId, name: "General Laboratory" } },
      update: { active: true },
      create: { tenantId: directory.tenantId, name: "General Laboratory" },
    });
    for (const test of demoTests) {
      await transaction.labTest.upsert({
        where: { tenantId_code: { tenantId: directory.tenantId, code: test.code } },
        update: {
          categoryId: category.id,
          name: test.name,
          price: test.price,
          sampleType: test.sampleType,
          resultType: test.resultType,
          unit: test.unit ?? null,
          referenceRange: test.referenceRange ?? null,
          panelComponents: test.panelComponents ?? Prisma.JsonNull,
          active: true,
        },
        create: {
          tenantId: directory.tenantId,
          categoryId: category.id,
          code: test.code,
          name: test.name,
          description: `Development seed: ${test.name}`,
          price: test.price,
          sampleType: test.sampleType,
          resultType: test.resultType,
          unit: test.unit ?? null,
          referenceRange: test.referenceRange ?? null,
          panelComponents: test.panelComponents ?? Prisma.JsonNull,
        },
      });
    }
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
