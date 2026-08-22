import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/auth.types.js";
import {
  notificationService,
  type NotificationService,
} from "../reporting/notification.service.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requirePermission } from "../middleware/authorization.js";

const uuid = z.uuid();

export function createNotificationRouter(
  authentication: AuthService,
  service: NotificationService = notificationService,
) {
  const router = Router();
  router.use(requireAuthentication(authentication), requirePermission("clinic.read"));

  router.get("/", async (request, response) => {
    response.json({
      data: await service.list(request.auth!, uuid.parse(request.query.branchId)),
    });
  });

  router.post("/:notificationId/read", async (request, response) => {
    response.json({
      data: await service.markRead(request.auth!, uuid.parse(request.params.notificationId)),
    });
  });

  return router;
}
