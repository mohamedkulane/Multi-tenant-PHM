import { Prisma } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { prisma } from "../database/prisma.js";
import { setTransactionContext, withTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";
import { canAccessBranch } from "../middleware/authorization.js";

export interface NotificationService {
  list(principal: AuthenticatedPrincipal, branchId: string): Promise<unknown>;
  scan(
    principal: AuthenticatedPrincipal,
    branchId: string,
    expiryDays?: number,
  ): Promise<{ created: number }>;
  markRead(principal: AuthenticatedPrincipal, notificationId: string): Promise<unknown>;
}

function requireBranch(principal: AuthenticatedPrincipal, branchId: string) {
  if (!canAccessBranch(principal, branchId)) {
    throw new AppError({
      statusCode: 403,
      code: "BRANCH_ACCESS_DENIED",
      message: "You do not have access to this branch",
    });
  }
}

export class PrismaNotificationService implements NotificationService {
  async list(principal: AuthenticatedPrincipal, branchId: string) {
    requireBranch(principal, branchId);
    const clinicalOnly = principal.role === "DOCTOR" || principal.role === "LAB_TECHNICIAN";
    if (!clinicalOnly) await this.scan(principal, branchId, 30);
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
        branchId,
      },
      async (transaction) => {
        const subscription = ["OWNER", "ADMIN"].includes(principal.role)
          ? await transaction.tenantSubscription.findUnique({
              where: { tenantId: principal.tenantId },
            })
          : null;
        const daysRemaining = subscription?.endsAt
          ? Math.ceil((subscription.endsAt.getTime() - Date.now()) / 86_400_000)
          : null;
        const subscriptionReminder =
          daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 2
            ? {
                id: principal.tenantId,
                tenantId: principal.tenantId,
                branchId: null,
                type: "SUBSCRIPTION_EXPIRING",
                fingerprint: `subscription-expiring:${subscription!.endsAt!.toISOString().slice(0, 10)}`,
                title: "Subscription-ka system-ka wuu dhacayaa",
                message:
                  daysRemaining === 0
                    ? "Subscription-ku maanta ayuu dhacayaa. Fadlan cusboonaysii."
                    : `Subscription-ku ${daysRemaining} maalin gudahood ayuu dhacayaa.`,
                entityType: "tenant_subscription",
                entityId: principal.tenantId,
                metadata: { readOnly: true, adminOnly: true },
                readAt: null,
                readByMembershipId: null,
                createdAt: new Date(),
              }
            : null;
        const [systemItems, systemUnread, platformItems, platformUnread] = await Promise.all([
          clinicalOnly
            ? Promise.resolve([])
            : transaction.notification.findMany({
                where: { tenantId: principal.tenantId, branchId },
                orderBy: { createdAt: "desc" },
                take: 100,
              }),
          clinicalOnly
            ? Promise.resolve(0)
            : transaction.notification.count({
                where: { tenantId: principal.tenantId, branchId, readAt: null },
              }),
          transaction.platformBroadcastDelivery.findMany({
            where: {
              tenantId: principal.tenantId,
              membershipId: principal.membershipId,
              OR: [{ branchId: null }, { branchId }],
            },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
          transaction.platformBroadcastDelivery.count({
            where: {
              tenantId: principal.tenantId,
              membershipId: principal.membershipId,
              readAt: null,
              OR: [{ branchId: null }, { branchId }],
            },
          }),
        ]);
        const messages = platformItems.map((item) => ({
          id: item.id,
          tenantId: item.tenantId,
          branchId: item.branchId,
          type: "PLATFORM_MESSAGE",
          fingerprint: `platform:${item.broadcastId}:${item.membershipId}`,
          title: item.title,
          message: item.message,
          entityType: "platform_broadcast",
          entityId: item.broadcastId,
          metadata: { source: "PLATFORM" },
          readAt: item.readAt,
          readByMembershipId: item.readAt ? item.membershipId : null,
          createdAt: item.createdAt,
        }));
        const items = [
          ...(subscriptionReminder ? [subscriptionReminder] : []),
          ...systemItems,
          ...messages,
        ]
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .slice(0, 100);
        return { unread: systemUnread + platformUnread + (subscriptionReminder ? 1 : 0), items };
      },
    );
  }

  async scan(principal: AuthenticatedPrincipal, branchId: string, expiryDays = 30) {
    requireBranch(principal, branchId);
    if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 365) {
      throw new AppError({
        statusCode: 400,
        code: "INVALID_EXPIRY_HORIZON",
        message: "Expiry horizon must be between 1 and 365 days",
      });
    }
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
        branchId,
      },
      async (transaction) => {
        const alerts = await transaction.$queryRaw<
          Array<{
            type: "LOW_STOCK" | "EXPIRING_BATCH" | "OVERDUE_DEBT";
            fingerprint: string;
            title: string;
            message: string;
            entity_type: string;
            entity_id: string;
          }>
        >(Prisma.sql`
          WITH stock AS (
            SELECT bp.product_id, p.name, bp.reorder_point_base_units,
              COALESCE(sum(b.quantity_on_hand), 0) quantity
            FROM public.branch_products bp
            JOIN public.products p ON p.tenant_id = bp.tenant_id AND p.id = bp.product_id
            LEFT JOIN public.inventory_batches b ON b.tenant_id = bp.tenant_id
              AND b.branch_id = bp.branch_id AND b.product_id = bp.product_id
              AND b.expiry_date >= CURRENT_DATE
            WHERE bp.tenant_id = ${principal.tenantId}::uuid
              AND bp.branch_id = ${branchId}::uuid AND bp.active
            GROUP BY bp.product_id, p.name, bp.reorder_point_base_units
          )
          SELECT 'LOW_STOCK'::text AS type,
            'low-stock:' || product_id::text AS fingerprint,
            name AS title,
            quantity::text || ' base units remaining' AS message,
            'product' AS entity_type, product_id::text AS entity_id
          FROM stock WHERE reorder_point_base_units > 0 AND quantity <= reorder_point_base_units
          UNION ALL
          SELECT 'EXPIRING_BATCH', 'expiring:' || b.id::text,
            CASE
              WHEN b.expiry_date < CURRENT_DATE THEN 'EXPIRED MEDICINE: ' || p.name
              WHEN b.expiry_date = CURRENT_DATE THEN 'EXPIRES TODAY: ' || p.name
              ELSE 'EXPIRING MEDICINE: ' || p.name
            END,
            CASE
              WHEN b.expiry_date < CURRENT_DATE
                THEN 'Batch ' || b.batch_number || ' expired on ' || b.expiry_date::text
              WHEN b.expiry_date = CURRENT_DATE
                THEN 'Batch ' || b.batch_number || ' expires today'
              ELSE 'Batch ' || b.batch_number || ' expires ' || b.expiry_date::text
            END,
            'inventory_batch', b.id::text
          FROM public.inventory_batches b
          JOIN public.products p ON p.tenant_id = b.tenant_id AND p.id = b.product_id
          WHERE b.tenant_id = ${principal.tenantId}::uuid
            AND b.branch_id = ${branchId}::uuid AND b.quantity_on_hand > 0
            AND b.expiry_date <= CURRENT_DATE + ${expiryDays}::int
          UNION ALL
          SELECT 'OVERDUE_DEBT', 'overdue-debt:' || d.id::text,
            s.customer_name, d.remaining_amount::text || ' overdue',
            'debt', d.id::text
          FROM public.debts d
          JOIN public.sales s ON s.tenant_id = d.tenant_id AND s.id = d.sale_id
          WHERE d.tenant_id = ${principal.tenantId}::uuid
            AND d.branch_id = ${branchId}::uuid
            AND d.remaining_amount > 0 AND d.due_date < CURRENT_DATE
            AND d.status <> 'VOIDED'
        `);
        let created = 0;
        for (const alert of alerts) {
          const existing = await transaction.notification.findUnique({
            where: {
              tenantId_fingerprint: {
                tenantId: principal.tenantId,
                fingerprint: alert.fingerprint,
              },
            },
            select: { id: true },
          });
          if (existing) {
            await transaction.notification.update({
              where: { tenantId_id: { tenantId: principal.tenantId, id: existing.id } },
              data: {
                type: alert.type,
                title: alert.title,
                message: alert.message,
                entityType: alert.entity_type,
                entityId: alert.entity_id,
              },
            });
          } else {
            await transaction.notification.create({
              data: {
                tenantId: principal.tenantId,
                branchId,
                type: alert.type,
                fingerprint: alert.fingerprint,
                title: alert.title,
                message: alert.message,
                entityType: alert.entity_type,
                entityId: alert.entity_id,
              },
            });
            created += 1;
          }
        }
        return { created };
      },
    );
  }

  async markRead(principal: AuthenticatedPrincipal, notificationId: string) {
    return prisma.$transaction(async (transaction) => {
      await setTransactionContext(transaction, {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      });
      await transaction.$queryRaw(
        Prisma.sql`SELECT set_config('app.notification_write', 'true', true)`,
      );
      const notification = await transaction.notification.findUnique({
        where: {
          tenantId_id: { tenantId: principal.tenantId, id: notificationId },
        },
      });
      if (!notification) {
        const delivery = await transaction.platformBroadcastDelivery.findUnique({
          where: { id: notificationId },
        });
        if (
          !delivery ||
          delivery.tenantId !== principal.tenantId ||
          delivery.membershipId !== principal.membershipId ||
          (delivery.branchId && !canAccessBranch(principal, delivery.branchId))
        ) {
          throw new AppError({
            statusCode: 404,
            code: "NOTIFICATION_NOT_FOUND",
            message: "Notification not found",
          });
        }
        if (delivery.readAt) return delivery;
        return transaction.platformBroadcastDelivery.update({
          where: { id: delivery.id },
          data: { readAt: new Date() },
        });
      }
      if (notification.branchId && !canAccessBranch(principal, notification.branchId)) {
        throw new AppError({
          statusCode: 404,
          code: "NOTIFICATION_NOT_FOUND",
          message: "Notification not found",
        });
      }
      if (notification.readAt) return notification;
      return transaction.notification.update({
        where: {
          tenantId_id: { tenantId: principal.tenantId, id: notificationId },
        },
        data: { readAt: new Date(), readByMembershipId: principal.membershipId },
      });
    });
  }
}

export const notificationService = new PrismaNotificationService();
