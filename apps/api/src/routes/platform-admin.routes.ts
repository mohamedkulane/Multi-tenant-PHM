import { TenantStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  requirePlatformAuthentication,
  requirePlatformRole,
} from "../middleware/platform-authentication.js";
import {
  platformAdminService,
  type PlatformAdminService,
} from "../platform/platform-admin.service.js";
import type { PlatformAuthService } from "../platform/platform-auth.types.js";
import {
  supportAccessService,
  type SupportAccessService,
} from "../platform/support-access.service.js";

const uuid = z.uuid();
const slug = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const planCode = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .regex(/^[a-z0-9_]+$/);
const planLimits = z
  .object({
    maxBranches: z.number().int().min(1).max(10_000),
    maxUsers: z.number().int().min(1).max(1_000_000),
    maxProducts: z.number().int().min(1).max(10_000_000),
    maxMonthlySales: z.number().int().min(1).max(100_000_000),
  })
  .strict();
const planOverrides = planLimits.partial();
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

function auditJson(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item: unknown) => auditJson(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, auditJson(item)]));
  }
  return value;
}

export function createPlatformAdminRouter(
  authentication: PlatformAuthService,
  administration: PlatformAdminService = platformAdminService,
  support: SupportAccessService = supportAccessService,
) {
  const router = Router();
  router.use(requirePlatformAuthentication(authentication));

  router.get("/plans", async (request, response) => {
    response.json({ data: await administration.listPlans(request.platformAuth!) });
  });

  router.put("/plans/:code", requirePlatformRole("SUPER_ADMIN"), async (request, response) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(100),
        description: z.string().trim().max(500).optional(),
        limits: planLimits,
        active: z.boolean().optional(),
      })
      .parse(request.body);
    response.json({
      data: await administration.upsertPlan(
        request.platformAuth!,
        planCode.parse(request.params.code),
        body,
      ),
    });
  });

  router.get("/tenants", async (request, response) => {
    response.json({ data: await administration.listTenants(request.platformAuth!) });
  });

  router.post("/tenants", requirePlatformRole("SUPER_ADMIN"), async (request, response) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(150),
        slug,
        timezone: z.string().trim().min(3).max(100),
        currencyCode: z.string().trim().length(3),
        planCode,
        branchName: z.string().trim().min(2).max(150),
        branchCode: z.string().trim().min(1).max(30),
        ownerFullName: z.string().trim().min(2).max(150),
        ownerEmail: z.email().max(320),
        ownerUsername: z.string().trim().min(2).max(80),
        ownerPassword: z.string().min(12).max(256),
      })
      .parse(request.body);
    response.status(201).json({
      data: await administration.onboard(
        request.platformAuth!,
        body,
        (response.locals as { requestId?: string }).requestId,
      ),
    });
  });

  router.get("/tenants/:tenantId", async (request, response) => {
    response.json({
      data: await administration.getTenant(
        request.platformAuth!,
        uuid.parse(request.params.tenantId),
      ),
    });
  });

  router.patch(
    "/tenants/:tenantId/status",
    requirePlatformRole("SUPER_ADMIN"),
    async (request, response) => {
      const body = z
        .object({
          status: z.enum(TenantStatus),
          reason: z.string().trim().min(3).max(1000),
        })
        .parse(request.body);
      response.json({
        data: await administration.setStatus(
          request.platformAuth!,
          uuid.parse(request.params.tenantId),
          body.status,
          body.reason,
          (response.locals as { requestId?: string }).requestId,
        ),
      });
    },
  );

  router.patch(
    "/tenants/:tenantId/plan",
    requirePlatformRole("SUPER_ADMIN"),
    async (request, response) => {
      const body = z.object({ planCode, overrides: planOverrides.default({}) }).parse(request.body);
      const overrides = Object.fromEntries(
        Object.entries(body.overrides).filter(([, value]) => value !== undefined),
      ) as Record<string, number>;
      response.json({
        data: await administration.setPlan(
          request.platformAuth!,
          uuid.parse(request.params.tenantId),
          body.planCode,
          overrides,
          (response.locals as { requestId?: string }).requestId,
        ),
      });
    },
  );

  router.put(
    "/tenants/:tenantId/branding",
    requirePlatformRole("SUPER_ADMIN"),
    async (request, response) => {
      const body = z
        .object({
          displayName: z.string().trim().min(2).max(150),
          logoUrl: z.url().max(1000).optional(),
          primaryColor: color,
          accentColor: color,
          invoiceFooter: z.string().trim().max(500).optional(),
          supportContact: z.string().trim().max(180).optional(),
        })
        .parse(request.body);
      response.json({
        data: await administration.setBranding(
          request.platformAuth!,
          uuid.parse(request.params.tenantId),
          body,
          (response.locals as { requestId?: string }).requestId,
        ),
      });
    },
  );

  router.get("/audit", requirePlatformRole("SUPER_ADMIN"), async (request, response) => {
    const take = z.coerce.number().int().min(1).max(500).default(100).parse(request.query.take);
    response.json({
      data: auditJson(await administration.audit(request.platformAuth!, take)),
    });
  });

  router.get("/support-requests", async (request, response) => {
    response.json({ data: await support.list(request.platformAuth!) });
  });

  router.post("/support-requests", async (request, response) => {
    const body = z
      .object({
        tenantId: uuid,
        reason: z.string().trim().min(10).max(1000),
      })
      .parse(request.body);
    response.status(201).json({
      data: await support.request(request.platformAuth!, body.tenantId, body.reason),
    });
  });

  router.post(
    "/support-requests/:requestId/decision",
    requirePlatformRole("SUPER_ADMIN"),
    async (request, response) => {
      const body = z
        .object({
          approve: z.boolean(),
          reason: z.string().trim().min(3).max(1000),
          durationMinutes: z.number().int().min(5).max(240).optional(),
        })
        .parse(request.body);
      response.json({
        data: await support.decide(
          request.platformAuth!,
          uuid.parse(request.params.requestId),
          body,
        ),
      });
    },
  );

  router.post("/support-requests/:requestId/activate", async (request, response) => {
    const result = await support.activate(
      request.platformAuth!,
      uuid.parse(request.params.requestId),
    );
    response.cookie(env.SESSION_COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1",
      expires: result.expiresAt,
    });
    response.json({
      data: { expiresAt: result.expiresAt, readOnly: true },
    });
  });

  router.post("/support-requests/:requestId/revoke", async (request, response) => {
    const body = z.object({ reason: z.string().trim().min(3).max(1000) }).parse(request.body);
    await support.revoke(request.platformAuth!, uuid.parse(request.params.requestId), body.reason);
    response.status(204).send();
  });

  return router;
}
