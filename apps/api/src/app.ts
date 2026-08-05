import cors from "cors";
import express, { type Request, type Response } from "express";
import * as helmetModule from "helmet";
import { pinoHttp } from "pino-http";
const helmet = ("default" in helmetModule
  ? helmetModule.default
  : helmetModule) as unknown as typeof import("helmet").default;
import { combinedAuthService } from "./auth/combined-auth.service.js";
import type { AuthService } from "./auth/auth.types.js";
import { platformAuthService } from "./platform/platform-auth.service.js";
import type { PlatformAuthService } from "./platform/platform-auth.types.js";
import {
  platformAdminService,
  type PlatformAdminService,
} from "./platform/platform-admin.service.js";
import {
  supportAccessService,
  type SupportAccessService,
} from "./platform/support-access.service.js";
import { env } from "./config/env.js";
import { checkDatabaseReadiness } from "./database/readiness.js";
import { customerService, type CustomerService } from "./crm/customer.service.js";
import { labService, type LabService } from "./lab/lab.service.js";
import { supplierService, type SupplierService } from "./partners/supplier.service.js";
import { debtService, type DebtService } from "./finance/debt.service.js";
import { expenseService, type ExpenseService } from "./finance/expense.service.js";
import { salesService, type SalesService } from "./finance/sales.service.js";
import { catalogService, type CatalogService } from "./inventory/catalog.service.js";
import { inventoryService, type InventoryService } from "./inventory/inventory.service.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { requestContext } from "./middleware/request-context.js";
import {
  invoiceDocumentService,
  type InvoiceDocumentService,
} from "./reporting/invoice-document.service.js";
import { jobService, type JobService } from "./reporting/job.service.js";
import { notificationService, type NotificationService } from "./reporting/notification.service.js";
import { reportService, type ReportService } from "./reporting/report.service.js";
import {
  tenantWorkspaceService,
  type TenantWorkspaceService,
} from "./tenant/tenant-workspace.service.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createCustomerRouter } from "./routes/customer.routes.js";
import { createLabRouter } from "./routes/lab.routes.js";
import { createSupplierRouter } from "./routes/supplier.routes.js";
import { createPlatformAuthRouter } from "./routes/platform-auth.routes.js";
import { createPlatformAdminRouter } from "./routes/platform-admin.routes.js";
import { createDebtRouter } from "./routes/debt.routes.js";
import { createExpenseRouter } from "./routes/expense.routes.js";
import { createHealthRouter, type ReadinessCheck } from "./routes/health.routes.js";
import { createInventoryRouter } from "./routes/inventory.routes.js";
import { createJobRouter } from "./routes/job.routes.js";
import { createNotificationRouter } from "./routes/notification.routes.js";
import { createProductRouter } from "./routes/product.routes.js";
import { createReportRouter } from "./routes/report.routes.js";
import { createSalesRouter } from "./routes/sales.routes.js";
import { createTenantRouter } from "./routes/tenant.routes.js";

export interface CreateAppOptions {
  readinessCheck?: ReadinessCheck;
  authentication?: AuthService;
  platformAuthentication?: PlatformAuthService;
  platformAdministration?: PlatformAdminService;
  supportAccess?: SupportAccessService;
  catalog?: CatalogService;
  inventory?: InventoryService;
  customers?: CustomerService;
  suppliers?: SupplierService;
  laboratory?: LabService;
  sales?: SalesService;
  expenses?: ExpenseService;
  debts?: DebtService;
  reports?: ReportService;
  jobs?: JobService;
  notifications?: NotificationService;
  invoiceDocuments?: InvoiceDocumentService;
  tenantWorkspace?: TenantWorkspaceService;
}

interface ResponseLocals {
  requestId?: string;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const allowedOrigins = new Set(env.WEB_ORIGINS);
  const authentication = options.authentication ?? combinedAuthService;
  const platformAuthentication = options.platformAuthentication ?? platformAuthService;

  app.disable("x-powered-by");
  app.set("json replacer", (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  if (env.TRUST_PROXY_HOPS > 0) {
    app.set("trust proxy", env.TRUST_PROXY_HOPS);
  }
  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      customProps: (_request: Request, response: Response) => {
        const locals = response.locals as ResponseLocals;

        return {
          requestId: locals.requestId,
        };
      },
      redact: {
        paths: [
          "req.headers.cookie",
          "req.headers.authorization",
          "res.headers.set-cookie",
          "req.body.password",
        ],
        censor: "[REDACTED]",
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/api", (_request, response) => {
    const locals = response.locals as ResponseLocals;
    response.json({
      data: {
        name: "PHMS Multi-Tenant API",
        version: "0.8.0",
        milestone: "M8",
      },
      requestId: locals.requestId,
    });
  });
  app.use("/api/v1/health", createHealthRouter(options.readinessCheck ?? checkDatabaseReadiness));
  app.use("/api/v1/auth", createAuthRouter(authentication));
  app.use(
    "/api/v1/tenant",
    createTenantRouter(authentication, options.tenantWorkspace ?? tenantWorkspaceService),
  );
  app.use("/api/v1/platform/auth", createPlatformAuthRouter(platformAuthentication));
  app.use(
    "/api/v1/platform",
    createPlatformAdminRouter(
      platformAuthentication,
      options.platformAdministration ?? platformAdminService,
      options.supportAccess ?? supportAccessService,
    ),
  );
  app.use(
    "/api/v1/products",
    createProductRouter(authentication, options.catalog ?? catalogService),
  );
  app.use(
    "/api/v1/inventory",
    createInventoryRouter(authentication, options.inventory ?? inventoryService),
  );

  app.use(
    "/api/v1/customers",
    createCustomerRouter(authentication, options.customers ?? customerService),
  );
  app.use(
    "/api/v1/suppliers",
    createSupplierRouter(authentication, options.suppliers ?? supplierService),
  );
  app.use("/api/v1/lab", createLabRouter(authentication, options.laboratory ?? labService));
  app.use("/api/v1/sales", createSalesRouter(authentication, options.sales ?? salesService));
  app.use("/api/v1/debts", createDebtRouter(authentication, options.debts ?? debtService));
  app.use(
    "/api/v1/expenses",
    createExpenseRouter(authentication, options.expenses ?? expenseService),
  );

  app.use(
    "/api/v1/reports",
    createReportRouter(
      authentication,
      options.reports ?? reportService,
      options.invoiceDocuments ?? invoiceDocumentService,
    ),
  );
  app.use("/api/v1/jobs", createJobRouter(authentication, options.jobs ?? jobService));
  app.use(
    "/api/v1/notifications",
    createNotificationRouter(authentication, options.notifications ?? notificationService),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
