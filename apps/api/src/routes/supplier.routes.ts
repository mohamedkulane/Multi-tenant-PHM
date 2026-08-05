import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/auth.types.js";
import { supplierService, type SupplierService } from "../partners/supplier.service.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requirePermission } from "../middleware/authorization.js";

const schema = z.object({
  name: z.string().trim().min(2).max(180),
  contactPerson: z.string().trim().max(180).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.email().max(320).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
  active: z.boolean().optional(),
});

export function createSupplierRouter(
  authentication: AuthService,
  service: SupplierService = supplierService,
) {
  const router = Router();
  router.use(requireAuthentication(authentication));
  router.get("/", requirePermission("supplier.read"), async (request, response) => {
    response.json({ data: await service.list(request.auth!) });
  });
  router.post("/", requirePermission("supplier.manage"), async (request, response) => {
    response.status(201).json({
      data: await service.save(
        request.auth!,
        undefined,
        schema.parse(request.body),
        response.locals.requestId as string | undefined,
      ),
    });
  });
  router.put("/:supplierId", requirePermission("supplier.manage"), async (request, response) => {
    response.json({
      data: await service.save(
        request.auth!,
        z.uuid().parse(request.params.supplierId),
        schema.parse(request.body),
        response.locals.requestId as string | undefined,
      ),
    });
  });
  return router;
}
