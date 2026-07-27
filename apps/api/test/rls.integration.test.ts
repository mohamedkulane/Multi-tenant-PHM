import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migratorUrl = process.env.TEST_ADMIN_DATABASE_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const runDatabaseTests = Boolean(migratorUrl && appUrl);
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase("PostgreSQL two-tenant RLS", () => {
  const migrator = new pg.Pool({ connectionString: migratorUrl });
  const application = new pg.Pool({ connectionString: appUrl });
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const branchA = randomUUID();
  const branchB = randomUUID();

  async function inTenantContext(
    tenantId: string,
    operation: (client: pg.PoolClient) => Promise<void>,
  ) {
    const client = await migrator.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await operation(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    await inTenantContext(tenantA, async (client) => {
      await client.query(
        `INSERT INTO public.tenants
           (id, name, slug, status, plan_code, timezone, currency_code, settings, updated_at)
         VALUES ($1, 'RLS Tenant A', $2, 'ACTIVE', 'test', 'UTC', 'USD', '{}', now())`,
        [tenantA, `rls-a-${tenantA}`],
      );
      await client.query(
        `INSERT INTO public.branches
           (id, tenant_id, name, code, timezone, updated_at)
         VALUES ($1, $2, 'Branch A', 'A', 'UTC', now())`,
        [branchA, tenantA],
      );
    });
    await inTenantContext(tenantB, async (client) => {
      await client.query(
        `INSERT INTO public.tenants
           (id, name, slug, status, plan_code, timezone, currency_code, settings, updated_at)
         VALUES ($1, 'RLS Tenant B', $2, 'ACTIVE', 'test', 'UTC', 'USD', '{}', now())`,
        [tenantB, `rls-b-${tenantB}`],
      );
      await client.query(
        `INSERT INTO public.branches
           (id, tenant_id, name, code, timezone, updated_at)
         VALUES ($1, $2, 'Branch B', 'B', 'UTC', now())`,
        [branchB, tenantB],
      );
    });
  });

  afterAll(async () => {
    await inTenantContext(tenantA, async (client) => {
      await client.query("DELETE FROM public.branches WHERE tenant_id = $1", [tenantA]);
      await client.query("DELETE FROM public.tenants WHERE id = $1", [tenantA]);
    });
    await inTenantContext(tenantB, async (client) => {
      await client.query("DELETE FROM public.branches WHERE tenant_id = $1", [tenantB]);
      await client.query("DELETE FROM public.tenants WHERE id = $1", [tenantB]);
    });
    await application.end();
    await migrator.end();
  });

  it("returns only rows belonging to the transaction tenant", async () => {
    const client = await application.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const result = await client.query<{ tenant_id: string; name: string }>(
        "SELECT tenant_id, name FROM public.branches ORDER BY name",
      );
      await client.query("ROLLBACK");

      expect(result.rows).toEqual([{ tenant_id: tenantA, name: "Branch A" }]);
    } finally {
      client.release();
    }
  });

  it("rejects a write carrying another tenant's id", async () => {
    const client = await application.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      await expect(
        client.query(
          `INSERT INTO public.branches
             (id, tenant_id, name, code, timezone, updated_at)
           VALUES ($1, $2, 'Cross Tenant', 'CROSS', 'UTC', now())`,
          [randomUUID(), tenantB],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});
