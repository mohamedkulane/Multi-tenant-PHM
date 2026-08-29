# DaawoKaal production handoff

Verified 29 August 2026 (Africa/Nairobi). Infrastructure is deployed; the pending
acceptance items below must not be mistaken for completed application testing.
This document contains no passwords, session secrets, private keys, or tokens.

## Production addresses

| Service | Address |
| --- | --- |
| Frontend | https://daawokaal.techrosolutions.com |
| Platform login | https://daawokaal.techrosolutions.com/platform/login |
| API base | https://api-daawokaal.techrosolutions.com/api/v1 |
| Readiness | https://api-daawokaal.techrosolutions.com/api/v1/health/ready |
| VPS | `185.197.31.102` / `vps1.techrosolutions.com` |

The API hostname uses a hyphen: **api-daawokaal**, not `api.daawokaal`.
Frontend requests use the API domain with credentials. The permitted origin is
exactly `https://daawokaal.techrosolutions.com`.

## Deployed components

- Ubuntu 24.04 LTS; Node 24.20.0; Nginx; Docker Engine and Compose.
- Application commit: `d6819f6b87a29beebb96a929b3a2ced7c9c76950` from `master`.
- Release: `/srv/phms/releases/20260828-d6819f6`; active symlink: `/srv/phms/current`.
- API runs as the unprivileged `phms` service user under `phms-api.service`.
- Frontend is served from `/srv/phms/current/apps/web/dist` only.
- API listens on `127.0.0.1:5001`; PostgreSQL 17.11 on `127.0.0.1:5433`;
  Redis 7.4.11 on `127.0.0.1:6379`.
- Redis is provisioned and healthy, but the current application does not consume it.
- `/etc/phms/compose.yml` controls the database/cache containers. Do not use the
  repository's development Compose file in production.
- Database `phms_prod` has separate non-superuser `phms_app` and `phms_migrator`
  roles, neither with BYPASSRLS. All 35 migrations and 61 policies were present.
- Nginx configuration: `/etc/nginx/sites-available/daawokaal`.
- Application environment: `/etc/phms/api.env`, root-owned and group-readable
  only by `phms`. Migration credentials: `/etc/phms/migration.env`, root-only.
  Never print or copy these into Git, chat, screenshots, or logs.

## Administrative access

SSH uses the `phms-deploy` account and the dedicated key kept outside this repo.
In Windows PowerShell:

```powershell
ssh -i "$env:USERPROFILE\.ssh\daawokaal_deploy_ed25519" -o "UserKnownHostsFile=$env:USERPROFILE\.ssh\daawokaal_known_hosts" -o StrictHostKeyChecking=yes phms-deploy@185.197.31.102
```

Use the VPS operator password at `sudo` prompts, not the Platform Admin password.
Deploy-user SSH and interactive sudo were verified. SSH password authentication
and root SSH login are disabled. The temporary root authorized key was revoked;
a fresh deploy-user connection was verified before cancelling the safety rollback.
Keep the VPSDime console available for recovery, and protect the local SSH key.

## Verified checks

- API/web builds and type checks passed before deployment.
- Public HTTPS frontend and API readiness return 200; HTTP redirects to HTTPS.
- Let's Encrypt certificate covers both domains. Initial expiry: 26 November
  2026. `snap.certbot.renew.timer` is active; renewal dry-run succeeded.
- Production-origin CORS preflight succeeds. Untrusted origin receives no
  permission to access responses, but currently reports HTTP 500 rather than a
  cleaner rejection status; track that application issue separately.
- Only ports 22, 80 and 443 were externally reachable. Internal ports 5001,
  5433 and 6379 were not reachable. UFW and fail2ban are enabled.
- VPS reboot changed the boot ID; API, frontend, containers, security services,
  and scheduled timers recovered automatically. Data and migrations persisted.
- Platform super-administrator was created and verified active in the database.
- Platform login was rendered in a real browser with no captured console errors.
  No user password was read or entered by the assistant.
- A fresh PostgreSQL backup was restored into an isolated temporary database;
  the admin and 35 migrations were verified. The temporary database was removed.
- A compressed PostgreSQL dump was uploaded to the private Backblaze B2 bucket,
  verified by name and non-zero matching size, and restored into a second isolated
  temporary database. Production signatures were unchanged after the test.

## Operations and backups

After connecting as `phms-deploy`:

```bash
sudo systemctl status phms-api nginx docker --no-pager
sudo journalctl -u phms-api -n 100 --no-pager
sudo docker compose -f /etc/phms/compose.yml ps
curl --fail https://api-daawokaal.techrosolutions.com/api/v1/health/ready
sudo systemctl list-timers daawokaal-backup.timer --all
sudo journalctl -u daawokaal-backup.service -n 100 --no-pager
sudo /usr/local/bin/backup-daawokaal.sh
sudo /usr/local/bin/backup-daawokaal.sh --restore-test
sudo find /opt/backups/daawokaal -maxdepth 1 -type f -name 'daawokaal-*.sql.gz' -printf '%f %s bytes\n'
sudo rclone --config /etc/rclone/daawokaal-b2.conf lsf daawokaal-b2:daawokaal-backups/postgresql --files-only --format 'tsp'
sudo certbot renew --dry-run --no-random-sleep-on-renew
```

- PostgreSQL/B2 backup script: `/usr/local/bin/backup-daawokaal.sh`; systemd unit:
  `daawokaal-backup.service`; timer: `daawokaal-backup.timer`.
- Daily schedule: 02:30 Africa/Mogadishu. The persistent timer catches a missed run.
  The next run observed after installation was 30 August 2026 at 02:30 Mogadishu
  time (29 August 23:30 UTC).
- Root-only compressed dumps: `/opt/backups/daawokaal/daawokaal-*.sql.gz`.
  Only the newest three are retained locally.
- Off-server target: `daawokaal-b2:daawokaal-backups/postgresql` in the private
  `daawokaal-backups` Backblaze B2 bucket. Matching objects older than 30 days are
  permanently deleted only after a new dump, gzip check, upload, and remote size
  verification succeed.
- Rclone 1.75.0 is installed at `/usr/local/bin/rclone`. Its credential config is
  root-owned mode 0600 at `/etc/rclone/daawokaal-b2.conf`; never print, copy, commit,
  or include that file in diagnostics. Bucket validation metadata is root-only at
  `/etc/daawokaal-backup/b2-bucket.validation`.
- The replaced local-only `phms-postgres-backup.timer` is disabled. Its two legacy
  dumps were removed after the new B2 upload and isolated restore test passed.
- Docker logs: 10 MB each, three files. Journal: 500 MB maximum, 14-day retention.
- Weekly maintenance removes unused Docker images older than seven days, never
  volumes. Do not run `docker compose down -v` on production.
- Before future migrations, back up; deploy a new release directory rather than
  editing live application files. Do not reset, delete, or rewrite migrations.
- Do not rerun the admin bootstrap for routine deployment: it rotates an existing
  administrator's password and revokes existing sessions.

## Pending acceptance / follow-up

1. Owner confirmation of a real browser login and authenticated dashboard load;
   the successful bootstrap alone does not verify browser cookies/session behavior.
2. Configure legitimate SMTP credentials securely, then exercise email verification
   and password-reset delivery. SMTP is not configured; those emails cannot yet send.
3. Configure operational alerting for backup/service failures; the private B2
   off-server backup, retention, and restore drill are complete.
4. Review dependency audit advisories observed during installation (Prisma tooling
   dependency chain). Do not apply forced major upgrades on the live deployment.

No local development patients, tenants, or databases were imported. Local deployment
documentation/Compose changes have not yet been committed or pushed to GitHub.
