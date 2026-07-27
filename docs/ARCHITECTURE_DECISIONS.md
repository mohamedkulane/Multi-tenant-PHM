# Architecture decisions

## ADR-001: Modular monolith

**Decision:** Build one deployable API with strict domain modules.

**Reason:** The initial platform needs strong transactions across inventory,
sales, debt and audit. Microservices would introduce distributed consistency
and operational complexity before scale or team boundaries justify it.

## ADR-002: Shared PostgreSQL database and shared schema

**Decision:** Tenant-owned tables contain mandatory `tenant_id`; operational
tables also contain `branch_id`.

**Reason:** This provides the best early balance of isolation, cost, migrations,
reporting and operations. Dedicated databases remain a later enterprise option.

## ADR-003: PostgreSQL Row-Level Security

**Decision:** Tenant scoping is enforced by application repositories and
PostgreSQL RLS. The runtime role cannot use `BYPASSRLS`.

**Reason:** Application filters alone are not a sufficient security boundary.

## ADR-004: Prisma with the PostgreSQL driver adapter

**Decision:** Start with Prisma ORM/Migrate 6.19.3,
`@prisma/adapter-pg` and `pg`.

**Reason:** Prisma provides typed models and migrations while PostgreSQL-specific
SQL migrations provide RLS policies, advanced constraints and indexes. Prisma 7
was evaluated during M1, but its current CLI development-dependency tree produced
active npm security advisories that npm workspaces could not safely override.
The selected Prisma 6 maintenance release passes a zero-vulnerability audit.
Upgrade only after the target Prisma 7 release passes generation, migrations,
tests and a clean dependency audit.

## ADR-005: Platform and tenant roles are separate

**Decision:** Platform users (`super_admin`, support, platform auditor) do not
automatically become tenant members.

**Reason:** Platform administration and pharmacy administration have different
security boundaries and audit requirements.

## ADR-006: Server-authoritative calculations

**Decision:** The API reloads packaging, prices, stock and permissions and
computes authoritative sale totals.

**Reason:** Browser values cannot be trusted for financial or inventory state.

## ADR-007: Atomic business workflows

**Decision:** Checkout, stock movement, invoice, optional debt and audit commit
in one database transaction. Debt payments update debt and sale in one
transaction.

**Reason:** Partial financial or inventory state is unacceptable.
