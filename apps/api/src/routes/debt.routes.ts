import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/auth.types.js";
import { debtService, type DebtService } from "../finance/debt.service.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requirePermission } from "../middleware/authorization.js";

const uuid = z.uuid();

export function createDebtRouter(authentication: AuthService, service: DebtService = debtService) {
  const router = Router();
  router.use(requireAuthentication(authentication), requirePermission("sale.payment"));

  router.get("/", async (request, response) => {
    response.json({
      data: await service.list(request.auth!, uuid.parse(request.query.branchId)),
    });
  });

  router.get("/:debtId", async (request, response) => {
    response.json({
      data: await service.get(request.auth!, uuid.parse(request.params.debtId)),
    });
  });

  return router;
}
