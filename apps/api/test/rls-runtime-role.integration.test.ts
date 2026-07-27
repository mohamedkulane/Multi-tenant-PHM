import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const appUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = appUrl ? describe : describe.skip;

describeDatabase("PostgreSQL runtime role safety", () => {
  const application = new pg.Pool({ connectionString: appUrl });

  afterAll(async () => {
    await application.end();
  });

  it("is neither a superuser nor able to bypass RLS", async () => {
    const result = await application.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      `SELECT rolsuper, rolbypassrls
       FROM pg_roles
       WHERE rolname = current_user`,
    );

    expect(result.rows[0]).toEqual({
      rolsuper: false,
      rolbypassrls: false,
    });
  });

  it("fails closed when no tenant context exists", async () => {
    const result = await application.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.branches",
    );
    expect(result.rows[0]?.count).toBe("0");
  });
});
