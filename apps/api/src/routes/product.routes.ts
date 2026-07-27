import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/auth.types.js";
import { catalogService, type CatalogService } from "../inventory/catalog.service.js";
import { productCategories } from "../inventory/packaging.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requirePermission } from "../middleware/authorization.js";

const countsSchema = z.object({
  boxesPerCarton: z.number().int().positive().optional(),
  stripsPerSmallBox: z.number().int().positive().optional(),
  unitsPerStrip: z.number().int().positive().optional(),
  bottlesPerBox: z.number().int().positive().optional(),
  vialsPerBox: z.number().int().positive().optional(),
  bagsPerBox: z.number().int().positive().optional(),
  tubesPerBox: z.number().int().positive().optional(),
  packsPerBox: z.number().int().positive().optional(),
  piecesPerPack: z.number().int().positive().optional(),
  padsPerPack: z.number().int().positive().optional(),
  piecesPerBox: z.number().int().positive().optional(),
});

const createProductSchema = z.object({
  name: z.string().trim().min(2).max(180),
  category: z.enum(productCategories),
  baseUnit: z.string().trim().min(1).max(40),
  sku: z.string().trim().max(80).optional(),
  barcode: z.string().trim().max(120).optional(),
  genericName: z.string().trim().max(180).optional(),
  brandName: z.string().trim().max(180).optional(),
  strength: z.string().trim().max(80).optional(),
  dosageForm: z.string().trim().max(80).optional(),
  manufacturer: z.string().trim().max(180).optional(),
  requiresPrescription: z.boolean().optional(),
  counts: countsSchema,
  outerPriceMinor: z.number().int().nonnegative().optional(),
  basePriceMinor: z.number().int().nonnegative().optional(),
  explicitPricesMinor: z
    .record(z.string().min(1).max(40), z.number().int().nonnegative())
    .optional(),
});

const updateProductSchema = z
  .object({
    name: z.string().trim().min(2).max(180).optional(),
    sku: z.string().trim().max(80).nullable().optional(),
    barcode: z.string().trim().max(120).nullable().optional(),
    genericName: z.string().trim().max(180).nullable().optional(),
    brandName: z.string().trim().max(180).nullable().optional(),
    strength: z.string().trim().max(80).nullable().optional(),
    dosageForm: z.string().trim().max(80).nullable().optional(),
    manufacturer: z.string().trim().max(180).nullable().optional(),
    requiresPrescription: z.boolean().optional(),
    active: z.boolean().optional(),
    packagePricesMinor: z
      .record(z.string().trim().min(1).max(40), z.number().int().nonnegative().nullable())
      .optional(),
    expectedVersion: z.number().int().positive(),
  })
  .refine(
    (body) => Object.keys(body).some((key) => key !== "expectedVersion"),
    "At least one product field must be changed",
  );

const idSchema = z.uuid();

export function createProductRouter(
  authentication: AuthService,
  service: CatalogService = catalogService,
) {
  const router = Router();
  router.use(requireAuthentication(authentication));

  router.get("/", requirePermission("inventory.read"), async (request, response) => {
    const query = z.string().trim().max(100).optional().parse(request.query.q);
    const products = await service.list(request.auth!, query);
    response.json({ data: products });
  });

  router.get("/:productId", requirePermission("inventory.read"), async (request, response) => {
    const product = await service.get(request.auth!, idSchema.parse(request.params.productId));
    response.json({ data: product });
  });

  router.post("/", requirePermission("inventory.manage"), async (request, response) => {
    const product = await service.create(
      request.auth!,
      createProductSchema.parse(request.body),
      response.locals.requestId as string | undefined,
    );
    response.status(201).json({ data: product });
  });

  router.patch("/:productId", requirePermission("inventory.manage"), async (request, response) => {
    const product = await service.update(
      request.auth!,
      idSchema.parse(request.params.productId),
      updateProductSchema.parse(request.body),
      response.locals.requestId as string | undefined,
    );
    response.json({ data: product });
  });

  return router;
}
