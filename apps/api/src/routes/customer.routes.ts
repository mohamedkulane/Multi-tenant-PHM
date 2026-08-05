import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/auth.types.js";
import { customerService, type CustomerService } from "../crm/customer.service.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requirePermission } from "../middleware/authorization.js";

const uuid = z.uuid();
const customerSchema = z.object({
  name: z.string().trim().min(2).max(180),
  phone: z.string().trim().min(3).max(40),
  address: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
  active: z.boolean().optional(),
});

export function createCustomerRouter(
  authentication: AuthService,
  service: CustomerService = customerService,
) {
  const router = Router();
  router.use(requireAuthentication(authentication));
  router.get("/", requirePermission("customer.read"), async (request, response) => {
    const q = z.string().trim().max(100).optional().parse(request.query.q);
    response.json({ data: await service.list(request.auth!, q) });
  });
  router.get("/:customerId", requirePermission("customer.read"), async (request, response) => {
    response.json({
      data: await service.get(request.auth!, uuid.parse(request.params.customerId)),
    });
  });
  router.post("/", requirePermission("customer.manage"), async (request, response) => {
    response.status(201).json({
      data: await service.create(
        request.auth!,
        customerSchema.parse(request.body),
        response.locals.requestId as string | undefined,
      ),
    });
  });
  router.put("/:customerId", requirePermission("customer.manage"), async (request, response) => {
    response.json({
      data: await service.update(
        request.auth!,
        uuid.parse(request.params.customerId),
        customerSchema.parse(request.body),
        response.locals.requestId as string | undefined,
      ),
    });
  });
  return router;
}
