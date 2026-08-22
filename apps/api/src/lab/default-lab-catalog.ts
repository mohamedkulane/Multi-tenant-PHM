import { Prisma } from "@prisma/client";

export const defaultLabTests = [
  {
    code: "MAL-RDT",
    name: "Malaria Rapid Diagnostic Test",
    description: "Rapid screening for malaria antigens.",
    price: "2.00",
    sampleType: "Blood",
    resultType: "POSITIVE_NEGATIVE" as const,
  },
  {
    code: "CBC",
    name: "Complete Blood Count",
    description: "Full blood count including white cells, red cells, haemoglobin and platelets.",
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
  {
    code: "TYPHOID",
    name: "Typhoid Serology",
    description: "Serology screening requested for suspected typhoid fever.",
    price: "3.00",
    sampleType: "Blood",
    resultType: "POSITIVE_NEGATIVE" as const,
  },
  {
    code: "UA",
    name: "Urinalysis",
    description: "Routine physical and chemical urine examination.",
    price: "3.00",
    sampleType: "Urine",
    resultType: "TEXT" as const,
  },
  {
    code: "RBS",
    name: "Random Blood Sugar",
    description: "Random plasma glucose measurement.",
    price: "2.50",
    sampleType: "Blood",
    resultType: "NUMERIC" as const,
    unit: "mg/dL",
    referenceRange: "70-140 mg/dL",
  },
  {
    code: "CRP",
    name: "C-Reactive Protein",
    description: "Quantitative inflammatory marker.",
    price: "4.00",
    sampleType: "Blood",
    resultType: "NUMERIC" as const,
    unit: "mg/L",
    referenceRange: "0-5 mg/L",
  },
  {
    code: "HCG",
    name: "Urine Pregnancy Test",
    description: "Qualitative urine hCG pregnancy screening.",
    price: "2.50",
    sampleType: "Urine",
    resultType: "POSITIVE_NEGATIVE" as const,
  },
] as const;

export async function provisionDefaultLabCatalog(
  transaction: Prisma.TransactionClient,
  tenantId: string,
) {
  const category = await transaction.labCategory.upsert({
    where: { tenantId_name: { tenantId, name: "General Laboratory" } },
    update: { active: true },
    create: { tenantId, name: "General Laboratory" },
  });

  for (const test of defaultLabTests) {
    await transaction.labTest.upsert({
      where: { tenantId_code: { tenantId, code: test.code } },
      update: {
        categoryId: category.id,
        name: test.name,
        description: test.description,
        price: test.price,
        sampleType: test.sampleType,
        resultType: test.resultType,
        unit: "unit" in test ? test.unit : null,
        referenceRange: "referenceRange" in test ? test.referenceRange : null,
        panelComponents: "panelComponents" in test ? test.panelComponents : Prisma.JsonNull,
        active: true,
      },
      create: {
        tenantId,
        categoryId: category.id,
        code: test.code,
        name: test.name,
        description: test.description,
        price: test.price,
        sampleType: test.sampleType,
        resultType: test.resultType,
        unit: "unit" in test ? test.unit : null,
        referenceRange: "referenceRange" in test ? test.referenceRange : null,
        panelComponents: "panelComponents" in test ? test.panelComponents : Prisma.JsonNull,
      },
    });
  }

  return { category, testsCreatedOrUpdated: defaultLabTests.length };
}
