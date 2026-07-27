import type { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma.js";
import { withTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { buildPackagingPlan, type PackagingCountKey, type ProductCategory } from "./packaging.js";

export interface CreateProductInput {
  name: string;
  category: ProductCategory;
  baseUnit: string;
  sku?: string | undefined;
  barcode?: string | undefined;
  genericName?: string | undefined;
  brandName?: string | undefined;
  strength?: string | undefined;
  dosageForm?: string | undefined;
  manufacturer?: string | undefined;
  requiresPrescription?: boolean | undefined;
  counts: Partial<Record<PackagingCountKey, number | undefined>>;
  outerPriceMinor?: number | undefined;
  basePriceMinor?: number | undefined;
  explicitPricesMinor?: Record<string, number | undefined> | undefined;
}

export interface UpdateProductInput {
  name?: string | undefined;
  sku?: string | null | undefined;
  barcode?: string | null | undefined;
  genericName?: string | null | undefined;
  brandName?: string | null | undefined;
  strength?: string | null | undefined;
  dosageForm?: string | null | undefined;
  manufacturer?: string | null | undefined;
  requiresPrescription?: boolean | undefined;
  active?: boolean | undefined;
  packagePricesMinor?: Record<string, number | null | undefined> | undefined;
  expectedVersion: number;
}

export interface CatalogService {
  list(principal: AuthenticatedPrincipal, query?: string): Promise<unknown[]>;
  get(principal: AuthenticatedPrincipal, productId: string): Promise<unknown>;
  create(
    principal: AuthenticatedPrincipal,
    input: CreateProductInput,
    requestId?: string,
  ): Promise<unknown>;
  update(
    principal: AuthenticatedPrincipal,
    productId: string,
    input: UpdateProductInput,
    requestId?: string,
  ): Promise<unknown>;
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function optionalText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function minorToDecimal(value: number) {
  const whole = Math.floor(value / 100);
  const fraction = String(value % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

function serializeProduct<
  P extends { unitsPerPackage: bigint; salePrice: Prisma.Decimal | null },
  T extends { packages: P[] },
>(product: T) {
  const { packages, ...productFields } = product;
  return {
    ...productFields,
    packages: packages.map((packaging) => ({
      ...packaging,
      unitsPerPackage: packaging.unitsPerPackage.toString(),
      salePrice: packaging.salePrice?.toFixed(4) ?? null,
    })),
  };
}

const productSelection = {
  id: true,
  name: true,
  category: true,
  baseUnit: true,
  sku: true,
  barcode: true,
  genericName: true,
  brandName: true,
  strength: true,
  dosageForm: true,
  manufacturer: true,
  requiresPrescription: true,
  active: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  packages: {
    where: { active: true },
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      code: true,
      label: true,
      unitsPerPackage: true,
      salePrice: true,
      sellable: true,
      sortOrder: true,
    },
  },
};

export class PrismaCatalogService implements CatalogService {
  async list(principal: AuthenticatedPrincipal, query?: string) {
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        const normalizedQuery = query?.trim();
        const products = await transaction.product.findMany({
          where: {
            tenantId: principal.tenantId,
            ...(normalizedQuery
              ? {
                  OR: [
                    {
                      name: {
                        contains: normalizedQuery,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      sku: {
                        contains: normalizedQuery,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      barcode: {
                        contains: normalizedQuery,
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                }
              : {}),
          },
          orderBy: { name: "asc" },
          select: productSelection,
          take: 100,
        });
        return products.map(serializeProduct);
      },
    );
  }

  async get(principal: AuthenticatedPrincipal, productId: string) {
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        const product = await transaction.product.findUnique({
          where: {
            tenantId_id: { tenantId: principal.tenantId, id: productId },
          },
          select: productSelection,
        });
        if (!product) {
          throw new AppError({
            statusCode: 404,
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found",
          });
        }
        return serializeProduct(product);
      },
    );
  }

  async create(principal: AuthenticatedPrincipal, input: CreateProductInput, requestId?: string) {
    const packagingPlan = buildPackagingPlan(input);
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        const product = await transaction.product.create({
          data: {
            tenantId: principal.tenantId,
            name: input.name.trim().replace(/\s+/g, " "),
            normalizedName: normalizeName(input.name),
            category: input.category,
            baseUnit: input.baseUnit.trim().toLowerCase(),
            sku: optionalText(input.sku) ?? null,
            barcode: optionalText(input.barcode) ?? null,
            genericName: optionalText(input.genericName) ?? null,
            brandName: optionalText(input.brandName) ?? null,
            strength: optionalText(input.strength) ?? null,
            dosageForm: optionalText(input.dosageForm) ?? null,
            manufacturer: optionalText(input.manufacturer) ?? null,
            requiresPrescription: input.requiresPrescription ?? false,
            packages: {
              create: packagingPlan.map((packaging) => ({
                code: packaging.code,
                label: packaging.label,
                unitsPerPackage: packaging.unitsPerLevel,
                salePrice:
                  packaging.salePriceMinor === null
                    ? null
                    : minorToDecimal(packaging.salePriceMinor),
                sortOrder: packaging.sortOrder,
              })),
            },
          },
          select: productSelection,
        });
        await transaction.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            actorUserId: principal.userId,
            actorMembershipId: principal.membershipId,
            ...(requestId ? { requestId } : {}),
            action: "PRODUCT_CREATED",
            entityType: "product",
            entityId: product.id,
            after: {
              name: product.name,
              category: product.category,
              packageCount: product.packages.length,
            },
          },
        });
        return serializeProduct(product);
      },
    );
  }

  async update(
    principal: AuthenticatedPrincipal,
    productId: string,
    input: UpdateProductInput,
    requestId?: string,
  ) {
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        const existing = await transaction.product.findUnique({
          where: {
            tenantId_id: { tenantId: principal.tenantId, id: productId },
          },
          select: { id: true, name: true, version: true, active: true },
        });
        if (!existing) {
          throw new AppError({
            statusCode: 404,
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found",
          });
        }
        if (existing.version !== input.expectedVersion) {
          throw new AppError({
            statusCode: 409,
            code: "PRODUCT_VERSION_CONFLICT",
            message: "Product was changed by another request",
          });
        }

        const result = await transaction.product.updateMany({
          where: {
            tenantId: principal.tenantId,
            id: productId,
            version: input.expectedVersion,
          },
          data: {
            ...(input.name
              ? {
                  name: input.name.trim().replace(/\s+/g, " "),
                  normalizedName: normalizeName(input.name),
                }
              : {}),
            ...(input.sku !== undefined ? { sku: input.sku?.trim() || null } : {}),
            ...(input.barcode !== undefined ? { barcode: input.barcode?.trim() || null } : {}),
            ...(input.genericName !== undefined
              ? { genericName: input.genericName?.trim() || null }
              : {}),
            ...(input.brandName !== undefined
              ? { brandName: input.brandName?.trim() || null }
              : {}),
            ...(input.strength !== undefined ? { strength: input.strength?.trim() || null } : {}),
            ...(input.dosageForm !== undefined
              ? { dosageForm: input.dosageForm?.trim() || null }
              : {}),
            ...(input.manufacturer !== undefined
              ? { manufacturer: input.manufacturer?.trim() || null }
              : {}),
            ...(input.requiresPrescription !== undefined
              ? { requiresPrescription: input.requiresPrescription }
              : {}),
            ...(input.active !== undefined ? { active: input.active } : {}),
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) {
          throw new AppError({
            statusCode: 409,
            code: "PRODUCT_VERSION_CONFLICT",
            message: "Product was changed by another request",
          });
        }
        if (input.packagePricesMinor) {
          for (const [code, priceMinor] of Object.entries(input.packagePricesMinor)) {
            const updatedPackage = await transaction.productPackage.updateMany({
              where: {
                tenantId: principal.tenantId,
                productId,
                code,
                active: true,
              },
              data: {
                salePrice:
                  priceMinor === null || priceMinor === undefined
                    ? null
                    : minorToDecimal(priceMinor),
              },
            });
            if (updatedPackage.count !== 1) {
              throw new AppError({
                statusCode: 400,
                code: "PRODUCT_PACKAGE_NOT_FOUND",
                message: `Active package ${code} was not found for this product`,
              });
            }
          }
        }
        const product = await transaction.product.findUniqueOrThrow({
          where: {
            tenantId_id: { tenantId: principal.tenantId, id: productId },
          },
          select: productSelection,
        });
        await transaction.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            actorUserId: principal.userId,
            actorMembershipId: principal.membershipId,
            ...(requestId ? { requestId } : {}),
            action: "PRODUCT_UPDATED",
            entityType: "product",
            entityId: product.id,
            before: { name: existing.name, active: existing.active },
            after: {
              name: product.name,
              active: product.active,
              version: product.version,
              packagePricesChanged: Object.keys(input.packagePricesMinor ?? {}).length,
            },
          },
        });
        return serializeProduct(product);
      },
    );
  }
}

export const catalogService = new PrismaCatalogService();
