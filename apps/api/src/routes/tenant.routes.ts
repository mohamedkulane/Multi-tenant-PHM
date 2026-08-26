import { MembershipStatus, TenantRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/auth.types.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requirePermission } from "../middleware/authorization.js";
import {
  tenantWorkspaceService,
  type TenantWorkspaceService,
} from "../tenant/tenant-workspace.service.js";

const uuid = z.uuid();
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const memberAccessSchema = z.object({
  role: z.enum(TenantRole).exclude(["OWNER"]),
  allBranches: z.boolean(),
  branchIds: z.array(uuid).max(100).default([]),
});
const branchUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(150).optional(),
    code: z.string().trim().min(1).max(40).optional(),
    timezone: z.string().trim().min(3).max(64).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "At least one branch field must change");

export function createTenantRouter(
  authentication: AuthService,
  service: TenantWorkspaceService = tenantWorkspaceService,
) {
  const router = Router();

  router.post("/invitations/accept", async (request, response) => {
    const body = z
      .object({
        token: z.string().min(50).max(200),
        fullName: z.string().trim().min(2).max(150),
        password: z.string().min(12).max(256),
      })
      .parse(request.body);
    response.status(201).json({ data: await service.accept(body) });
  });

  router.use(requireAuthentication(authentication));

  router.get("/workspace", requirePermission("tenant.read"), async (request, response) => {
    response.json({ data: await service.workspace(request.auth!) });
  });

  router.put("/settings", requirePermission("tenant.manage"), async (request, response) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(150),
        timezone: z.string().trim().min(3).max(64),
        currencyCode: z.string().trim().length(3),
        displayName: z.string().trim().min(2).max(150),
        logoUrl: z.url().max(1000).optional(),
        primaryColor: color,
        accentColor: color,
        invoiceFooter: z.string().trim().max(500).optional(),
        supportContact: z.string().trim().max(180).optional(),
        invoiceTitle: z.string().trim().min(2).max(120).default("SALES INVOICE"),
        invoicePaperSize: z.enum(["A4", "A5", "THERMAL_80MM"]).default("A4"),
        invoiceShowLogo: z.boolean().default(true),
        pharmacistDiscountPercent: z.number().min(0).max(100).default(0),
        consultationFee: z.number().min(0).max(1000000).default(0),
        paymentMethods: z
          .array(z.enum(["EVC_PLUS", "E_DAHAB", "SALAAM_BANK"]))
          .min(1)
          .max(3)
          .default(["EVC_PLUS", "E_DAHAB", "SALAAM_BANK"]),
      })
      .parse(request.body);
    response.json({
      data: await service.updateTenantSettings(
        request.auth!,
        body,
        response.locals.requestId as string | undefined,
      ),
    });
  });

  router.put("/branding", requirePermission("branding.manage"), async (request, response) => {
    const body = z
      .object({
        displayName: z.string().trim().min(2).max(150),
        logoUrl: z.url().max(1000).optional(),
        primaryColor: color,
        accentColor: color,
        invoiceFooter: z.string().trim().max(500).optional(),
        supportContact: z.string().trim().max(180).optional(),
        invoiceTitle: z.string().trim().min(2).max(120).default("SALES INVOICE"),
        invoicePaperSize: z.enum(["A4", "A5", "THERMAL_80MM"]).default("A4"),
        invoiceShowLogo: z.boolean().default(true),
        pharmacistDiscountPercent: z.number().min(0).max(100).default(0),
        consultationFee: z.number().min(0).max(1000000).default(0),
        paymentMethods: z
          .array(z.enum(["EVC_PLUS", "E_DAHAB", "SALAAM_BANK"]))
          .min(1)
          .max(3)
          .default(["EVC_PLUS", "E_DAHAB", "SALAAM_BANK"]),
      })
      .parse(request.body);
    response.json({
      data: await service.updateBranding(
        request.auth!,
        body,
        response.locals.requestId as string | undefined,
      ),
    });
  });

  router.post("/members", requirePermission("member.manage"), async (request, response) => {
    const body = z
      .object({
        fullName: z.string().trim().min(2).max(150),
        email: z.email().max(320).optional(),
        username: z.string().trim().min(2).max(80),
        password: z.string().min(12).max(256),
        role: z.enum(TenantRole).exclude(["OWNER"]),
        allBranches: z.boolean().default(false),
        branchIds: z.array(uuid).max(100).default([]),
      })
      .parse(request.body);
    response.status(201).json({
      data: await service.createMember(
        request.auth!,
        body,
        response.locals.requestId as string | undefined,
      ),
    });
  });
  router.get("/members", requirePermission("member.read"), async (request, response) => {
    response.json({ data: await service.members(request.auth!) });
  });

  router.patch(
    "/members/:membershipId",
    requirePermission("member.manage"),
    async (request, response) => {
      response.json({
        data: await service.updateMember(
          request.auth!,
          uuid.parse(request.params.membershipId),
          memberAccessSchema.parse(request.body),
          response.locals.requestId as string | undefined,
        ),
      });
    },
  );

  router.patch(
    "/members/:membershipId/status",
    requirePermission("member.manage"),
    async (request, response) => {
      const body = z.object({ status: z.enum(MembershipStatus) }).parse(request.body);
      response.json({
        data: await service.setMemberStatus(
          request.auth!,
          uuid.parse(request.params.membershipId),
          body.status,
        ),
      });
    },
  );

  router.get("/invitations", requirePermission("member.read"), async (request, response) => {
    response.json({ data: await service.invitations(request.auth!) });
  });

  router.post("/invitations", requirePermission("member.manage"), async (request, response) => {
    const body = z
      .object({
        email: z.email().max(320).optional(),
        username: z.string().trim().min(2).max(80),
        role: z.enum(TenantRole).exclude(["OWNER"]),
        allBranches: z.boolean().default(false),
        branchIds: z.array(uuid).max(100).default([]),
      })
      .parse(request.body);
    response.status(201).json({
      data: await service.invite(
        request.auth!,
        body,
        response.locals.requestId as string | undefined,
      ),
    });
  });

  router.post(
    "/invitations/:invitationId/revoke",
    requirePermission("member.manage"),
    async (request, response) => {
      response.json({
        data: await service.revokeInvitation(
          request.auth!,
          uuid.parse(request.params.invitationId),
        ),
      });
    },
  );

  router.post("/branches", requirePermission("branch.manage"), async (request, response) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(150),
        code: z.string().trim().min(1).max(40),
        timezone: z.string().trim().min(3).max(64),
      })
      .parse(request.body);
    response.status(201).json({
      data: await service.createBranch(
        request.auth!,
        body,
        response.locals.requestId as string | undefined,
      ),
    });
  });

  router.patch(
    "/branches/:branchId",
    requirePermission("branch.manage"),
    async (request, response) => {
      response.json({
        data: await service.updateBranch(
          request.auth!,
          uuid.parse(request.params.branchId),
          branchUpdateSchema.parse(request.body),
          response.locals.requestId as string | undefined,
        ),
      });
    },
  );

  router.get("/audit", requirePermission("audit.read"), async (request, response) => {
    const take = z.coerce.number().int().min(1).max(500).default(100).parse(request.query.take);
    response.json({ data: await service.audits(request.auth!, take) });
  });

  return router;
}
