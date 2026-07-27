import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/auth.types.js";
import { expenseService, type ExpenseService } from "../finance/expense.service.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requirePermission } from "../middleware/authorization.js";

const uuid = z.uuid();
const idempotencyKey = z
  .string()
  .trim()
  .min(8)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/);
const money = z
  .string()
  .trim()
  .regex(/^(0|[1-9][0-9]{0,14})(\.[0-9]{1,4})?$/);

const createExpenseSchema = z.object({
  branchId: uuid,
  categoryId: uuid,
  title: z.string().trim().min(2).max(180),
  amount: money,
  expenseDate: z.coerce.date(),
  note: z.string().trim().max(1000).optional(),
  idempotencyKey,
});

const voidExpenseSchema = z.object({
  branchId: uuid,
  reason: z.string().trim().min(3).max(500),
});

export function createExpenseRouter(
  authentication: AuthService,
  service: ExpenseService = expenseService,
) {
  const router = Router();
  router.use(requireAuthentication(authentication));

  router.get("/categories", requirePermission("expense.read"), async (request, response) => {
    const includeInactive = z.coerce.boolean().default(false).parse(request.query.includeInactive);
    response.json({ data: await service.listCategories(request.auth!, includeInactive) });
  });

  router.post("/categories", requirePermission("expense.manage"), async (request, response) => {
    const body = z.object({ name: z.string().trim().min(2).max(120) }).parse(request.body);
    const result = await service.createCategory(
      request.auth!,
      body.name,
      response.locals.requestId as string | undefined,
    );
    response.status(201).json({ data: result });
  });

  router.patch(
    "/categories/:categoryId",
    requirePermission("expense.manage"),
    async (request, response) => {
      const body = z
        .object({
          name: z.string().trim().min(2).max(120).optional(),
          active: z.boolean().optional(),
        })
        .refine((value) => Object.keys(value).length > 0, "At least one category field must change")
        .parse(request.body);
      response.json({
        data: await service.updateCategory(
          request.auth!,
          uuid.parse(request.params.categoryId),
          body,
          response.locals.requestId as string | undefined,
        ),
      });
    },
  );

  router.get("/", requirePermission("expense.read"), async (request, response) => {
    const branchId = uuid.parse(request.query.branchId);
    response.json({ data: await service.list(request.auth!, branchId) });
  });

  router.post("/", requirePermission("expense.manage"), async (request, response) => {
    const result = await service.create(
      request.auth!,
      createExpenseSchema.parse(request.body),
      response.locals.requestId as string | undefined,
    );
    response.status(201).json({ data: result });
  });

  router.post("/:expenseId/void", requirePermission("expense.void"), async (request, response) => {
    const body = voidExpenseSchema.parse(request.body);
    const result = await service.void(
      request.auth!,
      body.branchId,
      uuid.parse(request.params.expenseId),
      body.reason,
      response.locals.requestId as string | undefined,
    );
    response.status(201).json({ data: result });
  });

  return router;
}
