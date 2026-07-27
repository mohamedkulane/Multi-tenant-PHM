# M8 pilot and rollout runbook

## Pilot admission gates

A tenant enters the pilot only when:

- M1–M7 repository gates pass
- migration validation has zero errors
- backup restore is proven
- tenant owner and branches are confirmed
- plan limits are intentional
- monitoring and incident ownership are assigned
- rollback authority is named
- support approval separation is staffed

## Service objectives

| Signal                               | Pilot objective               |
| ------------------------------------ | ----------------------------- |
| API availability                     | at least 99.5% over the pilot |
| Server errors                        | below 0.5% of requests        |
| Interactive API p95                  | below 750 ms                  |
| Report API p95                       | below 2 seconds               |
| Job success                          | at least 99% after retry      |
| Tenant isolation incidents           | zero                          |
| Financial reconciliation differences | zero                          |
| Backup age                           | below 24 hours                |

## Stability window

Run one tenant for 14 days. Review availability, latency, error rate, jobs,
database growth, audit evidence, stock variance, invoice sequence, collections,
receivables and support sessions every business day. Any severity-one incident
restarts the stability window after remediation.

## Incident levels

- **SEV-1:** tenant isolation, financial corruption, lost evidence or total outage
- **SEV-2:** major workflow unavailable with no acceptable workaround
- **SEV-3:** degraded workflow with a safe workaround

SEV-1 immediately stops rollout, revokes support sessions, preserves logs and
database evidence, and places affected tenants into controlled read-only mode.

## Phased rollout

1. internal synthetic tenant
2. one cooperative pilot pharmacy
3. five low-complexity tenants
4. 25% of eligible tenants
5. 50%
6. 100%

Each phase requires a completed stability window or an explicit risk acceptance
signed by the platform owner. No phase proceeds with unresolved isolation,
reconciliation, backup or severity-one findings.

## Release evidence

Archive the commit, dependency lock, migration list, Prisma validation, test
results, production builds, vulnerability audit, backup checksum, restore
rehearsal, load report, migration manifest, reconciliation report, pilot owner,
incident contacts and go/no-go decision.
