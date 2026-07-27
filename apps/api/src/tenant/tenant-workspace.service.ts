import { MembershipStatus, type PrismaClient, type TenantRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createOneTimeToken, hashOneTimeToken } from "../auth/one-time-token.js";
import { hashPassword } from "../auth/password.js";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { prisma } from "../database/prisma.js";
import { setTransactionContext, withTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";

export interface CreateInvitationInput {
  email?: string | undefined;
  username: string;
  role: Exclude<TenantRole, "OWNER">;
  allBranches: boolean;
  branchIds: string[];
}

export interface AcceptInvitationInput {
  token: string;
  fullName: string;
  password: string;
}

export interface UpdateMemberInput {
  role: Exclude<TenantRole, "OWNER">;
  allBranches: boolean;
  branchIds: string[];
}

export interface UpdateTenantSettingsInput {
  name: string;
  timezone: string;
  currencyCode: string;
  displayName: string;
  logoUrl?: string | undefined;
  primaryColor: string;
  accentColor: string;
  invoiceFooter?: string | undefined;
  supportContact?: string | undefined;
}

function serializeAudit<T extends { id: bigint }>(entry: T) {
  return { ...entry, id: entry.id.toString() };
}

function parseInviteToken(raw: string) {
  const [tenantId, secret, extra] = raw.split(".");
  if (
    extra ||
    !tenantId ||
    !secret ||
    !/^[0-9a-f-]{36}$/i.test(tenantId) ||
    !/^[A-Za-z0-9_-]{43}$/.test(secret)
  ) {
    return null;
  }
  return { tenantId: tenantId.toLowerCase(), secret };
}

export class TenantWorkspaceService {
  constructor(private readonly client: PrismaClient = prisma) {}

  async workspace(principal: AuthenticatedPrincipal) {
    return withTenantContext(
      this.client,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        const [tenant, branches, branding, subscription] = await Promise.all([
          transaction.tenant.findUniqueOrThrow({
            where: { id: principal.tenantId },
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              planCode: true,
              timezone: true,
              currencyCode: true,
            },
          }),
          transaction.branch.findMany({
            where: {
              tenantId: principal.tenantId,
              active: true,
              ...(principal.allBranches ? {} : { id: { in: principal.branchIds } }),
            },
            orderBy: { name: "asc" },
          }),
          transaction.tenantBranding.findUnique({
            where: { tenantId: principal.tenantId },
          }),
          transaction.tenantSubscription.findUnique({
            where: { tenantId: principal.tenantId },
          }),
        ]);
        return { tenant, branches, branding, subscription };
      },
    );
  }

  async members(principal: AuthenticatedPrincipal) {
    return withTenantContext(
      this.client,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      (transaction) =>
        transaction.tenantMembership.findMany({
          where: { tenantId: principal.tenantId },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            username: true,
            role: true,
            status: true,
            allBranches: true,
            createdAt: true,
            user: { select: { id: true, fullName: true, email: true } },
            branches: { select: { branchId: true } },
          },
        }),
    );
  }

  async audits(principal: AuthenticatedPrincipal, take = 100) {
    return withTenantContext(
      this.client,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) =>
        (
          await transaction.auditLog.findMany({
            where: { tenantId: principal.tenantId },
            orderBy: { createdAt: "desc" },
            take: Math.min(Math.max(take, 1), 500),
          })
        ).map(serializeAudit),
    );
  }

  async createBranch(
    principal: AuthenticatedPrincipal,
    input: { name: string; code: string; timezone: string },
    requestId?: string,
  ) {
    return withTenantContext(
      this.client,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        const branch = await transaction.branch.create({
          data: {
            tenantId: principal.tenantId,
            name: input.name.trim(),
            code: input.code.trim().toUpperCase(),
            timezone: input.timezone,
          },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            branchId: branch.id,
            actorUserId: principal.userId,
            actorMembershipId: principal.membershipId,
            action: "BRANCH_CREATED",
            entityType: "branch",
            entityId: branch.id,
            ...(requestId ? { requestId } : {}),
            after: { name: branch.name, code: branch.code },
          },
        });
        return branch;
      },
    );
  }

  async updateBranch(
    principal: AuthenticatedPrincipal,
    branchId: string,
    input: {
      name?: string | undefined;
      code?: string | undefined;
      timezone?: string | undefined;
      phone?: string | null | undefined;
      active?: boolean | undefined;
    },
    requestId?: string,
  ) {
    return withTenantContext(
      this.client,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        const current = await transaction.branch.findUnique({
          where: { tenantId_id: { tenantId: principal.tenantId, id: branchId } },
        });
        if (!current) {
          throw new AppError({
            statusCode: 404,
            code: "BRANCH_NOT_FOUND",
            message: "Branch not found",
          });
        }
        if (current.active && input.active === false) {
          const activeBranches = await transaction.branch.count({
            where: { tenantId: principal.tenantId, active: true },
          });
          if (activeBranches <= 1) {
            throw new AppError({
              statusCode: 409,
              code: "LAST_ACTIVE_BRANCH",
              message: "A tenant must keep at least one active branch",
            });
          }
        }
        const branch = await transaction.branch.update({
          where: { tenantId_id: { tenantId: principal.tenantId, id: branchId } },
          data: {
            ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(input.code !== undefined ? { code: input.code.trim().toUpperCase() } : {}),
            ...(input.timezone !== undefined ? { timezone: input.timezone.trim() } : {}),
            ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
            ...(input.active !== undefined ? { active: input.active } : {}),
          },
        });
        if (input.active === false) {
          await transaction.membershipBranch.deleteMany({
            where: { tenantId: principal.tenantId, branchId },
          });
          await transaction.session.updateMany({
            where: { tenantId: principal.tenantId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        await transaction.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            branchId,
            actorUserId: principal.userId,
            actorMembershipId: principal.membershipId,
            action: input.active === false ? "BRANCH_DEACTIVATED" : "BRANCH_UPDATED",
            entityType: "branch",
            entityId: branchId,
            ...(requestId ? { requestId } : {}),
            before: {
              name: current.name,
              code: current.code,
              timezone: current.timezone,
              phone: current.phone,
              active: current.active,
            },
            after: {
              name: branch.name,
              code: branch.code,
              timezone: branch.timezone,
              phone: branch.phone,
              active: branch.active,
            },
          },
        });
        return branch;
      },
    );
  }

  async invitations(principal: AuthenticatedPrincipal) {
    return withTenantContext(
      this.client,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      (transaction) =>
        transaction.invitation.findMany({
          where: { tenantId: principal.tenantId },
          orderBy: { createdAt: "desc" },
          include: { branches: { select: { branchId: true } } },
        }),
    );
  }

  async invite(
    principal: AuthenticatedPrincipal,
    input: CreateInvitationInput,
    requestId?: string,
  ) {
    const token = createOneTimeToken();
    const invitation = await withTenantContext(
      this.client,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        if (!input.allBranches && input.branchIds.length === 0) {
          throw new AppError({
            statusCode: 400,
            code: "INVITATION_BRANCH_REQUIRED",
            message: "Choose at least one branch or grant all-branch access",
          });
        }
        const validBranchCount = await transaction.branch.count({
          where: {
            tenantId: principal.tenantId,
            id: { in: input.branchIds },
            active: true,
          },
        });
        if (!input.allBranches && validBranchCount !== input.branchIds.length) {
          throw new AppError({
            statusCode: 400,
            code: "INVALID_BRANCH_ASSIGNMENT",
            message: "One or more branch assignments are invalid",
          });
        }
        const created = await transaction.invitation.create({
          data: {
            tenantId: principal.tenantId,
            email: input.email?.trim().toLowerCase() || null,
            username: input.username.trim().toLowerCase(),
            role: input.role,
            allBranches: input.allBranches,
            tokenHash: token.hash,
            expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
            invitedByMembershipId: principal.membershipId,
            ...(input.allBranches
              ? {}
              : {
                  branches: {
                    create: input.branchIds.map((branchId) => ({
                      tenantId: principal.tenantId,
                      branchId,
                    })),
                  },
                }),
          },
          include: { branches: { select: { branchId: true } } },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            actorUserId: principal.userId,
            actorMembershipId: principal.membershipId,
            action: "MEMBER_INVITED",
            entityType: "invitation",
            entityId: created.id,
            ...(requestId ? { requestId } : {}),
            after: {
              username: created.username,
              role: created.role,
              allBranches: created.allBranches,
            },
          },
        });
        return created;
      },
    );
    return {
      invitation,
      acceptanceToken: `${principal.tenantId}.${token.raw}`,
    };
  }

  async revokeInvitation(principal: AuthenticatedPrincipal, invitationId: string) {
    return withTenantContext(
      this.client,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        const invitation = await transaction.invitation.findUnique({
          where: { tenantId_id: { tenantId: principal.tenantId, id: invitationId } },
        });
        if (!invitation) {
          throw new AppError({
            statusCode: 404,
            code: "INVITATION_NOT_FOUND",
            message: "Invitation not found",
          });
        }
        if (invitation.acceptedAt) {
          throw new AppError({
            statusCode: 409,
            code: "INVITATION_ALREADY_ACCEPTED",
            message: "An accepted invitation cannot be revoked",
          });
        }
        const revoked = await transaction.invitation.update({
          where: { tenantId_id: { tenantId: principal.tenantId, id: invitationId } },
          data: { revokedAt: new Date() },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            actorUserId: principal.userId,
            actorMembershipId: principal.membershipId,
            action: "INVITATION_REVOKED",
            entityType: "invitation",
            entityId: invitationId,
            after: { username: revoked.username, revokedAt: revoked.revokedAt?.toISOString() },
          },
        });
        return revoked;
      },
    );
  }
  async accept(input: AcceptInvitationInput) {
    const parsed = parseInviteToken(input.token);
    if (!parsed) {
      throw new AppError({
        statusCode: 400,
        code: "INVITATION_INVALID",
        message: "The invitation token is invalid",
      });
    }
    const passwordHash = await hashPassword(input.password);
    const userId = randomUUID();
    const membershipId = randomUUID();
    return withTenantContext(this.client, { tenantId: parsed.tenantId }, async (transaction) => {
      const invitation = await transaction.invitation.findUnique({
        where: { tokenHash: hashOneTimeToken(parsed.secret) },
        include: { branches: { select: { branchId: true } } },
      });
      if (
        !invitation ||
        invitation.tenantId !== parsed.tenantId ||
        invitation.acceptedAt ||
        invitation.revokedAt ||
        invitation.expiresAt <= new Date()
      ) {
        throw new AppError({
          statusCode: 409,
          code: "INVITATION_UNAVAILABLE",
          message: "The invitation is expired, revoked, or already accepted",
        });
      }
      await setTransactionContext(transaction, {
        tenantId: parsed.tenantId,
        userId,
        membershipId,
      });
      await transaction.user.create({
        data: {
          id: userId,
          email: invitation.email,
          fullName: input.fullName.trim(),
          passwordHash,
        },
      });
      await transaction.tenantMembership.create({
        data: {
          id: membershipId,
          tenantId: parsed.tenantId,
          userId,
          username: invitation.username,
          role: invitation.role,
          status: MembershipStatus.ACTIVE,
          allBranches: invitation.allBranches,
          ...(invitation.allBranches
            ? {}
            : {
                branches: {
                  create: invitation.branches.map(({ branchId }) => ({
                    tenantId: parsed.tenantId,
                    branchId,
                  })),
                },
              }),
        },
      });
      await transaction.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: parsed.tenantId,
          actorUserId: userId,
          actorMembershipId: membershipId,
          action: "INVITATION_ACCEPTED",
          entityType: "tenant_membership",
          entityId: membershipId,
        },
      });
      return {
        tenantId: parsed.tenantId,
        username: invitation.username,
        membershipId,
      };
    });
  }

  async updateMember(
    principal: AuthenticatedPrincipal,
    membershipId: string,
    input: UpdateMemberInput,
    requestId?: string,
  ) {
    if (membershipId === principal.membershipId) {
      throw new AppError({
        statusCode: 409,
        code: "SELF_ACCESS_CHANGE_FORBIDDEN",
        message: "You cannot change your own role or branch access",
      });
    }
    return withTenantContext(
      this.client,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        const current = await transaction.tenantMembership.findUnique({
          where: { tenantId_id: { tenantId: principal.tenantId, id: membershipId } },
          include: { branches: { select: { branchId: true } } },
        });
        if (!current) {
          throw new AppError({
            statusCode: 404,
            code: "MEMBERSHIP_NOT_FOUND",
            message: "Membership not found",
          });
        }
        if (current.role === "OWNER") {
          throw new AppError({
            statusCode: 403,
            code: "OWNER_ACCESS_IMMUTABLE",
            message: "The owner role and access cannot be changed here",
          });
        }
        if (principal.role !== "OWNER" && current.role === "ADMIN") {
          throw new AppError({
            statusCode: 403,
            code: "ADMIN_ACCESS_REQUIRES_OWNER",
            message: "Only the owner can change an administrator",
          });
        }
        if (!input.allBranches && input.branchIds.length === 0) {
          throw new AppError({
            statusCode: 400,
            code: "MEMBER_BRANCH_REQUIRED",
            message: "Choose at least one branch or grant all-branch access",
          });
        }
        const uniqueBranchIds = [...new Set(input.branchIds)];
        if (!input.allBranches) {
          const validBranches = await transaction.branch.count({
            where: {
              tenantId: principal.tenantId,
              id: { in: uniqueBranchIds },
              active: true,
            },
          });
          if (validBranches !== uniqueBranchIds.length) {
            throw new AppError({
              statusCode: 400,
              code: "INVALID_BRANCH_ASSIGNMENT",
              message: "One or more branch assignments are invalid",
            });
          }
        }
        const membership = await transaction.tenantMembership.update({
          where: { tenantId_id: { tenantId: principal.tenantId, id: membershipId } },
          data: {
            role: input.role,
            allBranches: input.allBranches,
            branches: {
              deleteMany: {},
              ...(input.allBranches
                ? {}
                : {
                    create: uniqueBranchIds.map((branchId) => ({
                      tenantId: principal.tenantId,
                      branchId,
                    })),
                  }),
            },
          },
          include: { branches: { select: { branchId: true } } },
        });
        await transaction.session.updateMany({
          where: { tenantId: principal.tenantId, membershipId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            actorUserId: principal.userId,
            actorMembershipId: principal.membershipId,
            action: "MEMBER_ACCESS_UPDATED",
            entityType: "tenant_membership",
            entityId: membershipId,
            ...(requestId ? { requestId } : {}),
            before: {
              role: current.role,
              allBranches: current.allBranches,
              branchIds: current.branches.map(({ branchId }) => branchId),
            },
            after: {
              role: membership.role,
              allBranches: membership.allBranches,
              branchIds: membership.branches.map(({ branchId }) => branchId),
            },
          },
        });
        return membership;
      },
    );
  }

  async updateTenantSettings(
    principal: AuthenticatedPrincipal,
    input: UpdateTenantSettingsInput,
    requestId?: string,
  ) {
    return withTenantContext(
      this.client,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        const before = await transaction.tenant.findUniqueOrThrow({
          where: { id: principal.tenantId },
        });
        const tenant = await transaction.tenant.update({
          where: { id: principal.tenantId },
          data: {
            name: input.name.trim(),
            timezone: input.timezone.trim(),
            currencyCode: input.currencyCode.trim().toUpperCase(),
          },
        });
        const branding = await transaction.tenantBranding.upsert({
          where: { tenantId: principal.tenantId },
          create: {
            tenantId: principal.tenantId,
            displayName: input.displayName.trim(),
            logoUrl: input.logoUrl?.trim() || null,
            primaryColor: input.primaryColor.toUpperCase(),
            accentColor: input.accentColor.toUpperCase(),
            invoiceFooter: input.invoiceFooter?.trim() || null,
            supportContact: input.supportContact?.trim() || null,
          },
          update: {
            displayName: input.displayName.trim(),
            logoUrl: input.logoUrl?.trim() || null,
            primaryColor: input.primaryColor.toUpperCase(),
            accentColor: input.accentColor.toUpperCase(),
            invoiceFooter: input.invoiceFooter?.trim() || null,
            supportContact: input.supportContact?.trim() || null,
          },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            actorUserId: principal.userId,
            actorMembershipId: principal.membershipId,
            action: "TENANT_SETTINGS_UPDATED",
            entityType: "tenant",
            entityId: principal.tenantId,
            ...(requestId ? { requestId } : {}),
            before: {
              name: before.name,
              timezone: before.timezone,
              currencyCode: before.currencyCode,
            },
            after: {
              name: tenant.name,
              timezone: tenant.timezone,
              currencyCode: tenant.currencyCode,
              displayName: branding.displayName,
            },
          },
        });
        return { tenant, branding };
      },
    );
  }
  async setMemberStatus(
    principal: AuthenticatedPrincipal,
    membershipId: string,
    status: MembershipStatus,
    requestId?: string,
  ) {
    if (membershipId === principal.membershipId) {
      throw new AppError({
        statusCode: 409,
        code: "SELF_STATUS_CHANGE_FORBIDDEN",
        message: "You cannot change your own membership status",
      });
    }
    return withTenantContext(
      this.client,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        const current = await transaction.tenantMembership.findUnique({
          where: { tenantId_id: { tenantId: principal.tenantId, id: membershipId } },
        });
        if (!current) {
          throw new AppError({
            statusCode: 404,
            code: "MEMBERSHIP_NOT_FOUND",
            message: "Membership not found",
          });
        }
        if (current.role === "OWNER") {
          throw new AppError({
            statusCode: 403,
            code: "OWNER_STATUS_IMMUTABLE",
            message: "The owner membership cannot be deactivated",
          });
        }
        if (principal.role !== "OWNER" && current.role === "ADMIN") {
          throw new AppError({
            statusCode: 403,
            code: "ADMIN_STATUS_REQUIRES_OWNER",
            message: "Only the owner can change an administrator",
          });
        }
        const membership = await transaction.tenantMembership.update({
          where: { tenantId_id: { tenantId: principal.tenantId, id: membershipId } },
          data: { status },
        });
        if (status !== MembershipStatus.ACTIVE) {
          await transaction.session.updateMany({
            where: {
              tenantId: principal.tenantId,
              membershipId,
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          });
        }
        await transaction.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            actorUserId: principal.userId,
            actorMembershipId: principal.membershipId,
            action: "MEMBER_STATUS_CHANGED",
            entityType: "tenant_membership",
            entityId: membershipId,
            ...(requestId ? { requestId } : {}),
            before: { status: current.status },
            after: { status: membership.status },
          },
        });
        return membership;
      },
    );
  }
}

export const tenantWorkspaceService = new TenantWorkspaceService();
