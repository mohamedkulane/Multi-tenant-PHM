export const productCategories = [
  "tablets_capsules",
  "syrups_liquids",
  "injections",
  "iv_fluids",
  "creams_ointments_gels",
  "drops",
  "baby_products",
  "womens_products",
  "medical_supplies",
  "supplements_vitamins",
  "dental_products",
  "laboratory_items",
] as const;

export type ProductCategory = (typeof productCategories)[number];

export interface PackagingLevel {
  code: string;
  label: string;
  unitsPerLevel: bigint;
  salePriceMinor: number | null;
  sortOrder: number;
  isBaseUnit: boolean;
}

export interface PackagingPlanInput {
  category: ProductCategory;
  counts: Partial<Record<PackagingCountKey, number | undefined>>;
  outerPriceMinor?: number | undefined;
  basePriceMinor?: number | undefined;
  explicitPricesMinor?: Record<string, number | undefined> | undefined;
}

export type PackagingCountKey =
  | "boxesPerCarton"
  | "stripsPerSmallBox"
  | "unitsPerStrip"
  | "bottlesPerBox"
  | "vialsPerBox"
  | "bagsPerBox"
  | "tubesPerBox"
  | "packsPerBox"
  | "piecesPerPack"
  | "padsPerPack"
  | "piecesPerBox";

interface LevelTemplate {
  code: string;
  label: string;
  factors: PackagingCountKey[];
}

interface CategoryTemplate {
  requiredCounts: PackagingCountKey[];
  levels: LevelTemplate[];
}

const templates: Record<ProductCategory, CategoryTemplate> = {
  tablets_capsules: {
    requiredCounts: ["boxesPerCarton", "stripsPerSmallBox", "unitsPerStrip"],
    levels: [
      {
        code: "large_carton",
        label: "Large Carton",
        factors: ["boxesPerCarton", "stripsPerSmallBox", "unitsPerStrip"],
      },
      {
        code: "small_box",
        label: "Small Box",
        factors: ["stripsPerSmallBox", "unitsPerStrip"],
      },
      { code: "strip", label: "Strip", factors: ["unitsPerStrip"] },
      { code: "unit", label: "Tablet/Capsule", factors: [] },
    ],
  },
  syrups_liquids: singleOuterTemplate("carton", "Carton", "bottle", "Bottle", "bottlesPerBox"),
  injections: singleOuterTemplate("carton", "Carton", "vial", "Vial/Ampoule", "vialsPerBox"),
  iv_fluids: singleOuterTemplate("carton", "Carton", "bag", "Bag/Bottle", "bagsPerBox"),
  creams_ointments_gels: singleOuterTemplate("box", "Box", "tube", "Tube/Jar", "tubesPerBox"),
  drops: singleOuterTemplate("carton", "Carton", "bottle", "Bottle", "bottlesPerBox"),
  baby_products: {
    requiredCounts: ["packsPerBox", "piecesPerPack"],
    levels: [
      {
        code: "carton",
        label: "Carton",
        factors: ["packsPerBox", "piecesPerPack"],
      },
      { code: "pack", label: "Pack", factors: ["piecesPerPack"] },
      { code: "piece", label: "Piece", factors: [] },
    ],
  },
  womens_products: {
    requiredCounts: ["packsPerBox", "padsPerPack"],
    levels: [
      {
        code: "carton",
        label: "Carton",
        factors: ["packsPerBox", "padsPerPack"],
      },
      { code: "pack", label: "Pack", factors: ["padsPerPack"] },
      { code: "pad", label: "Pad", factors: [] },
    ],
  },
  medical_supplies: singleOuterTemplate("box", "Box", "piece", "Piece", "piecesPerBox"),
  supplements_vitamins: singleOuterTemplate("box", "Box", "bottle", "Bottle/Jar", "bottlesPerBox"),
  dental_products: singleOuterTemplate("pack", "Pack", "piece", "Piece/Tube", "piecesPerBox"),
  laboratory_items: singleOuterTemplate("box", "Box", "piece", "Piece", "piecesPerBox"),
};

function singleOuterTemplate(
  outerCode: string,
  outerLabel: string,
  baseCode: string,
  baseLabel: string,
  count: PackagingCountKey,
): CategoryTemplate {
  return {
    requiredCounts: [count],
    levels: [
      { code: outerCode, label: outerLabel, factors: [count] },
      { code: baseCode, label: baseLabel, factors: [] },
    ],
  };
}

function positiveWholeNumber(value: number | undefined, field: string): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) < 1) {
    throw new Error(`${field} must be a positive whole number`);
  }
  return value!;
}

function optionalMoney(value: number | undefined, field: string) {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer in minor units`);
  }
  return value;
}

export function buildPackagingPlan(input: PackagingPlanInput): PackagingLevel[] {
  const template = templates[input.category];
  for (const key of template.requiredCounts) {
    positiveWholeNumber(input.counts[key], key);
  }

  const outerPriceMinor = optionalMoney(input.outerPriceMinor, "outerPriceMinor");
  const basePriceMinor = optionalMoney(input.basePriceMinor, "basePriceMinor");
  const rawLevels = template.levels.map((level) => ({
    ...level,
    unitsPerLevel: level.factors.reduce(
      (total, factor) => total * BigInt(positiveWholeNumber(input.counts[factor], factor)),
      1n,
    ),
  }));
  const outerUnits = rawLevels[0]!.unitsPerLevel;

  return rawLevels.map((level, index) => {
    const explicitPrice = optionalMoney(
      input.explicitPricesMinor?.[level.code],
      `explicitPricesMinor.${level.code}`,
    );
    const derivedFromOuter =
      outerPriceMinor === undefined
        ? null
        : Number((BigInt(outerPriceMinor) * level.unitsPerLevel + outerUnits / 2n) / outerUnits);
    const salePriceMinor =
      explicitPrice ??
      (level.factors.length === 0 ? basePriceMinor : undefined) ??
      derivedFromOuter;

    return {
      code: level.code,
      label: level.label,
      unitsPerLevel: level.unitsPerLevel,
      salePriceMinor,
      sortOrder: index,
      isBaseUnit: level.unitsPerLevel === 1n,
    };
  });
}

export function quantityToBaseUnits(
  level: Pick<PackagingLevel, "unitsPerLevel">,
  quantity: number,
) {
  return level.unitsPerLevel * BigInt(positiveWholeNumber(quantity, "quantity"));
}

export function findPackagingLevel(plan: PackagingLevel[], code: string): PackagingLevel {
  const level = plan.find((candidate) => candidate.code === code);
  if (!level) throw new Error(`Unknown packaging level '${code}'`);
  return level;
}
