# M7 and M8 implementation status

## Delivered

The application now includes a complete operational frontend for the M2–M6
backend:

- separate pharmacy and platform authentication
- responsive tenant and platform navigation
- branch-aware dashboard, catalog, inventory, checkout and invoices
- debts, expenses, reports, jobs, notifications and audit
- staff membership visibility and one-time invitation acceptance
- platform tenant onboarding, lifecycle, plans, support and audit pages
- tenant workspace API for branches, subscriptions, members and audit
- localhost-only development binding

M7 production tooling includes:

- deterministic MongoDB export validation
- source SHA-256 and record-count manifest
- financial control totals and reference-integrity checks
- PostgreSQL custom-format backup with SHA-256 manifest
- authenticated load smoke test with p50/p95/p99 output
- migration, reconciliation, credential, security and rollback runbooks

M8 rollout tooling includes:

- pilot admission template
- measurable service objectives
- 14-day stability window
- incident severity and rollout-stop rules
- phased rollout gates
- one-command repository release gate and evidence manifest

## External execution still required

Code cannot truthfully complete these environment-dependent events without the
real production inputs:

1. obtain the final MongoDB export
2. resolve any validator errors
3. rehearse restore on isolated infrastructure
4. run production-scale load tests
5. select the real pilot tenant and accountable people
6. observe the 14-day stability window
7. approve each rollout phase

Those are controlled operational decisions, not missing application code. The
provided tools and runbooks make their evidence repeatable.
