# PHMS deployment on VPSDime

Deployment runbook · reviewed against this repository on 27 August 2026.

For the actual two-domain DaawoKaal deployment and verified operations, see
[DaawoKaal production handoff](DAAWOKAAL_PRODUCTION.md). The examples below use
a single domain; do not replace the deployed API hostname with those examples.

This guide prepares a **new Ubuntu 24.04 LTS VPS**, not a shared-hosting account.
It does not deploy anything automatically. Replace every `REPLACE_...` value
before running commands. Commands below run in **Bash over SSH on the VPS**, not
in your local Windows PowerShell. Test the release on staging before admitting
real patients. Hardware sizing depends on usage; measure memory, disk and latency
during the pilot instead of assuming a plan can handle a fixed patient count.

## 1. Architecture and important boundaries

```text
Browser → HTTPS Nginx :443
             ├─ /              React static build
             └─ /api/          Express on 127.0.0.1:5001
                                    ├─ PostgreSQL 17 on 127.0.0.1:5433
                                    └─ Redis 7 on 127.0.0.1:6379 (reserved for future cache/queues)
```

- The examples use one public domain, `clinic.example.com`, for both web and API.
  DaawoKaal instead uses the separate frontend/API domains recorded in its handoff.
- Node runs under systemd as an unprivileged `phms` user. Nginx serves only
  `apps/web/dist`, never the repository root or `.env` files.
- PostgreSQL and Redis run in Docker with persistent volumes; PostgreSQL uses separate migration and
  runtime roles. The current API does not consume Redis yet; it is provisioned on loopback only for
  future cache/queue work and must not be treated as an active application dependency. VPSDime supports Docker on its Linux VPS offerings; published
  database ports should be loopback-only. [VPSDime Docker guidance](https://vpsdime.com/knowledgebase/technical-questions/docker-on-vps)
- **Do not use the root `docker-compose.yml` in production.** It contains local
  development credentials and a publicly bound port. Use the separate
  [production database compose](../deploy/compose.postgres.yml), without merging
  it with the development file. Never reuse local database passwords.
- This repository has no standalone worker entry point. Export/notification jobs
  are processed through authenticated API routes. Do not invent a `worker.js`
  service or promise scheduled email/SMS delivery merely by deploying the API.

## 2. Secure the VPS and point DNS

Create a non-root sudo operator, install an SSH public key, and verify a second
SSH session before disabling password/root login. Keep console access available
in the provider panel. Follow [VPSDime first-server setup](https://vpsdime.com/knowledgebase/getting-started/first-30-minutes).

Point the domain's DNS A record at the VPS IPv4 address. Add AAAA only if IPv6 is
configured and reachable. This guide assumes direct DNS, not a second CDN proxy.

```bash
sudo apt update
sudo apt upgrade
sudo apt install -y git nginx ufw ca-certificates curl xz-utils openssl build-essential
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

If SSH uses a nonstandard port, allow that actual port **before** enabling UFW.
Apply the equivalent provider firewall policy: SSH from your operator IP where
possible, public TCP 80/443, no public 5001/5432/5433/5173. Docker publishing can
bypass UFW, so binding the database to loopback is still essential.
[Docker firewall behavior](https://docs.docker.com/engine/network/packet-filtering-firewalls/)

## 3. Install supported runtimes

Install Docker Engine and the Compose plugin using the official Ubuntu apt
repository instructions, not the old Ubuntu `docker.io` package alongside Docker
CE. Check both commands below. [Docker installation](https://docs.docker.com/engine/install/ubuntu/)

```bash
sudo docker version
sudo docker compose version
```

Install an official **Node.js 24 LTS** Linux build appropriate for the VPS CPU,
verify its published checksum, and install it system-wide so that
`/usr/local/bin/node` is available to systemd. Do not rely on an interactive
shell's `nvm` initialization. The repository requires Node >=22.12 and npm >=11;
verify both versions and adjust `ExecStart` below if the verified Node binary has
a different absolute path. [Official Node downloads](https://nodejs.org/en/download)

```bash
node --version
npm --version
command -v node
sudo useradd --system --create-home --home-dir /srv/phms --shell /usr/sbin/nologin phms
sudo chmod 755 /srv/phms
sudo install -d -o phms -g phms -m 755 /srv/phms/releases
sudo install -d -o root -g phms -m 750 /etc/phms
```

For an existing server, inspect existing users/directories first; do not replace
them blindly. Avoid granting the application user Docker or sudo privileges.

## 4. Prepare a reviewed release

Use a read-only GitHub deploy key for a private repository. Keep its private key
outside the checkout with restricted permissions; do not embed tokens in URLs.
The operator's SSH key/agent is used by this clone command.

```bash
RELEASE=REPLACE_WITH_RELEASE_ID
REPO=git@github.com:REPLACE_ORG/REPLACE_REPOSITORY.git
COMMIT=REPLACE_WITH_REVIEWED_COMMIT_SHA
git clone "$REPO" "$RELEASE"
git -C "$RELEASE" checkout --detach "$COMMIT"
sudo mv "$RELEASE" /srv/phms/releases/
sudo chown -R phms:phms "/srv/phms/releases/$RELEASE"
cd "/srv/phms/releases/$RELEASE"
sudo -u phms npm ci
sudo -u phms env DATABASE_URL='postgresql://unused:unused@127.0.0.1:5433/unused' npm run db:generate
sudo -u phms npm run typecheck
sudo -u phms env VITE_API_URL=/api/v1 npm run build
sudo chmod 755 "/srv/phms/releases/$RELEASE" "/srv/phms/releases/$RELEASE/apps" "/srv/phms/releases/$RELEASE/apps/web"
sudo chmod -R a+rX "/srv/phms/releases/$RELEASE/apps/web/dist"
```

The generation URL is an unused parser value; `db:generate` generates the client,
it does not migrate or connect to a real database. `VITE_API_URL` is public build
configuration, never a place for passwords. Do not deploy with `npm run dev` or
`vite preview`. Keep devDependencies available for Prisma commands and builds.

## 5. Provision the production database

Generate a separate database administrator password in a root-only file:

```bash
sudo install -m 600 /dev/null /etc/phms/postgres-password
openssl rand -hex 32 | sudo tee /etc/phms/postgres-password >/dev/null
sudo docker compose -f deploy/compose.postgres.yml up -d
sudo docker compose -f deploy/compose.postgres.yml ps
sudo docker compose -f deploy/compose.postgres.yml exec postgres psql -U postgres -d postgres
```

In the interactive `psql` session, create these roles **before migrations**.
The migrations grant scoped access to the exact `phms_app` role. Set unique strong
passwords through the hidden `\password` prompts, not shell history:

```sql
CREATE ROLE phms_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE phms_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
\password phms_migrator
\password phms_app
CREATE DATABASE phms_prod OWNER phms_migrator;
REVOKE ALL ON DATABASE phms_prod FROM PUBLIC;
GRANT CONNECT ON DATABASE phms_prod TO phms_app;
\connect phms_prod
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO phms_app;
\quit
```

Do not add blanket default privileges or `GRANT ALL` to resolve errors: migrations
intentionally restrict audit/finance tables and private archives. The runtime
role must not own tables, be a superuser, or have `BYPASSRLS`.

From the **release root**, run reviewed migrations with the migration role:

```bash
read -rsp 'Migration DATABASE_URL: ' PHMS_MIGRATION_URL; printf '\n'
# Enter postgresql://phms_migrator:URL_ENCODED_PASSWORD@127.0.0.1:5433/phms_prod?schema=public
sudo -u phms env DATABASE_URL="$PHMS_MIGRATION_URL" npm run db:deploy -w @phms/api
unset PHMS_MIGRATION_URL
```

Percent-encode special characters in connection-string passwords. Do not use
`db:migrate` (`migrate dev`), `migrate reset`, `db push`, demo seeds, or test fixtures
against production. Do not mark failed migrations as applied without reviewing
the actual schema. For an existing database, take and restore-test a backup first.

## 6. Configure API environment and bootstrap the platform owner

```bash
sudo install -o root -g phms -m 640 /dev/null /etc/phms/api.env
sudoedit /etc/phms/api.env
```

Contents (replace placeholders; the API uses only `DATABASE_URL`, not a separate
automatic migration-URL variable):

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=5001
APP_BASE_URL=https://clinic.example.com
WEB_ORIGINS=https://clinic.example.com
DATABASE_URL=postgresql://phms_app:REPLACE_URL_ENCODED_APP_PASSWORD@127.0.0.1:5433/phms_prod?schema=public
SESSION_SECRET=REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS
SESSION_COOKIE_NAME=phms_session
SESSION_TTL_HOURS=12
TRUST_PROXY_HOPS=1
LOG_LEVEL=info
```

Generate `SESSION_SECRET` with `openssl rand -hex 32` and store it in your password
manager. Exact HTTPS origins are required for login and mutations. One trusted
proxy hop is correct only for the single Nginx proxy in this guide. Do not disable
secure cookies to make HTTP login work; enable HTTPS first.

For first-time owner creation, use a short-lived shell as the runtime user:

```bash
sudo -u phms /bin/bash
set -a
. /etc/phms/api.env
set +a
cd /srv/phms/releases/REPLACE_WITH_RELEASE_ID
read -rp 'Platform owner email: ' PLATFORM_ADMIN_EMAIL
read -rp 'Platform owner full name: ' PLATFORM_ADMIN_FULL_NAME
read -rsp 'Platform owner password (16+ characters): ' PLATFORM_ADMIN_PASSWORD; printf '\n'
export PLATFORM_ADMIN_EMAIL PLATFORM_ADMIN_FULL_NAME PLATFORM_ADMIN_PASSWORD
npm run db:bootstrap-platform-admin -w @phms/api
unset PLATFORM_ADMIN_PASSWORD PLATFORM_ADMIN_EMAIL PLATFORM_ADMIN_FULL_NAME DATABASE_URL SESSION_SECRET
exit
```

Keep `api.env` values shell-safe (URL-encoded password; hex secret). This command
**rotates an existing owner's password and revokes sessions** if the same email
already exists. It is not a command to run on every deployment.

## 7. Run the API with systemd

On the first deployment only, create the current-release link:

```bash
sudo ln -s "/srv/phms/releases/$RELEASE" /srv/phms/current
sudoedit /etc/systemd/system/phms-api.service
```

Unit file:

```ini
[Unit]
Description=PHMS API
Wants=network-online.target docker.service
After=network-online.target docker.service

[Service]
Type=simple
User=phms
Group=phms
WorkingDirectory=/srv/phms/current/apps/api
EnvironmentFile=/etc/phms/api.env
ExecStart=/usr/local/bin/node /srv/phms/current/apps/api/dist/server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=20
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

The current API keeps export content in PostgreSQL; it does not require a public
uploads folder. If future features write files, add an explicit persistent
directory and a narrow systemd `ReadWritePaths` exception, then back it up.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now phms-api
sudo systemctl status phms-api --no-pager
curl --fail http://127.0.0.1:5001/api/v1/health/live
curl --fail http://127.0.0.1:5001/api/v1/health/ready
```

Readiness checks database connectivity, **not** complete migration/RLS correctness.

## 8. Nginx and HTTPS

Create `/etc/nginx/sites-available/phms` using `sudoedit`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name clinic.example.com;
    root /srv/phms/current/apps/web/dist;
    index index.html;
    client_max_body_size 1m;

    location /api/ {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        add_header Cache-Control "no-store" always;
    }
    location = /index.html {
        add_header Cache-Control "no-store" always;
    }
    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
    location ~ /\. {
        deny all;
    }
}
```

`proxy_pass` deliberately has **no trailing slash**: Express expects `/api/v1/...`
unchanged. The SPA fallback allows refreshing a doctor/reception/invoice URL.

```bash
sudo ln -s /etc/nginx/sites-available/phms /etc/nginx/sites-enabled/phms
sudo nginx -t
sudo systemctl reload nginx
```

Install Certbot following its current Nginx instructions, then issue the
certificate and enable the HTTP-to-HTTPS redirect. DNS and port 80 must already
work. [Certbot Nginx instructions](https://certbot.eff.org/instructions?ws=nginx&os=snap)

```bash
sudo certbot --nginx -d clinic.example.com
sudo certbot renew --dry-run
sudo nginx -t
curl --fail https://clinic.example.com/api/v1/health/ready
```

Verify automatic certificate renewal is enabled. Never serve real logins over
plain HTTP while waiting for the certificate.

## 9. Release acceptance

Use a staging/demo tenant with synthetic records, not real patient transactions:

- Platform login, tenant onboarding, owner login and account password management.
- Owner creates role/branch-scoped staff; each staff role sees only its work.
- Reception registers a visit, collects consultation/lab fees, views old visits
  and reprints the lab authorization without results or monetary amounts.
- Doctor orders tests; lab collects the correct samples, enters results; doctor
  views that day's results. Neither role receives financial amounts.
- Pharmacy List is default; medicines left/cart right on desktop, stacked mobile;
  sale completion navigates to the separate invoice page.
- Test authorization slips at 80mm and 58mm on the actual printer (see below).
- Refresh a nested route, sign out, restart the API, and reboot in a maintenance
  window to verify persistence and automatic startup.
- Check logs for errors and confirm 5001/5433 are not reachable externally.

Do not infer complete security or business-flow approval from a green build or
health endpoint. Run the integration suite only against a separate disposable
test database with its own runtime/migration credentials.

## 10. Backups, restore and updates

Back up before every migration and on an agreed schedule. Docker volumes and VPS
snapshots alone are not an off-server backup. Protect dumps as sensitive health
data: restrictive permissions, encryption, separate off-server storage, documented
retention and access. Keep secrets in an independently recoverable password vault.

From a release directory, a manual logical backup is:

```bash
sudo install -d -m 700 /var/backups/phms
PHMS_BACKUP="/var/backups/phms/phms-$(date -u +%Y%m%dT%H%M%SZ).dump"
set -o pipefail
sudo docker compose -f deploy/compose.postgres.yml exec -T postgres pg_dump -U postgres -d phms_prod --format=custom | sudo tee "$PHMS_BACKUP" >/dev/null
sudo chmod 600 "$PHMS_BACKUP"
sudo test -s "$PHMS_BACKUP"
sudo cat "$PHMS_BACKUP" | sudo docker compose -f deploy/compose.postgres.yml exec -T postgres pg_restore --list >/dev/null
```

`pg_restore --list` checks archive readability, **not a successful restore**.
On an isolated recovery server, recreate the roles from section 5 with new passwords
and create a new empty recovery database owned by `phms_migrator`. Restore with
PostgreSQL 17 `pg_restore --exit-on-error -U postgres -d phms_restore`, supplying
the dump on stdin. Preserve the archived ownership and grants (do not pass
`--no-owner` or `--no-acl`). Database dumps do not include role passwords or
cluster-wide role definitions; keep that provisioning information separately.
Do not grant broad runtime access as a shortcut. Run RLS/authentication/clinical
acceptance checks on that recovery copy before declaring the backup usable.
Never restore over production as an experiment; never run `docker compose down -v`.

For an update:

1. Record the current commit and `/srv/phms/current` target. Prepare a new release
   following section 4, while keeping the old directory.
2. Restore-test a fresh backup; review every new migration, especially renumbering
   or destructive changes. Announce a maintenance window for schema changes.
3. Stop `phms-api`, run `db:deploy` as `phms_migrator` from the new release, and stop
   immediately if it fails. Do not restart an incompatible old binary.
4. Point `/srv/phms/current` at the reviewed new release (`ln -sfn` only after
   confirming that `current` is a symlink inside `/srv/phms`), start the service,
   and perform the acceptance checks.
5. Keep the previous release and backup. Roll back code only if the previous
   version is compatible with the new schema. Otherwise follow the reviewed
   database recovery plan; restoration can lose writes after the backup.

Before public launch, configure and test scheduled encrypted backups, off-server
copying, failure alerts, disk monitoring and an actual restore drill. They are
operational requirements, not services automatically installed by this document.

The DaawoKaal production host now uses `/usr/local/bin/backup-daawokaal.sh` with
`daawokaal-backup.timer` at 02:30 Africa/Mogadishu. It keeps three compressed local
dumps under `/opt/backups/daawokaal`, copies them to the private
`daawokaal-b2:daawokaal-backups/postgresql` target, and removes matching remote
objects after 30 days. The installation acceptance test verified `pg_dump`, gzip,
remote name/size, and a full restore into an isolated temporary database without
changing production. Operational details and safe commands are recorded in
`docs/DAAWOKAAL_PRODUCTION.md`.

## 11. Common problems

| Symptom                            | Check                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Login `INTERNAL_ERROR`             | Correlate request ID with `journalctl -u phms-api`; check migrations and runtime grants. Do not disable RLS. |
| 502 Bad Gateway                    | API service state, absolute Node path, environment permissions, and loopback port 5001.                      |
| CORS / origin rejected             | Exact `https://clinic.example.com` in `WEB_ORIGINS`, correct proxy headers; restart API after edits.         |
| Login succeeds but session is lost | HTTPS, browser cookie settings, exact origin and session secret; avoid mixed localhost/domain URLs.          |
| `EADDRINUSE`                       | `sudo ss -ltnp`; identify the owner of 5001. Run one systemd API instance, not an additional dev server.     |
| Database permission error          | Confirm `phms_app` existed before migrations; use reviewed per-table/function grants.                        |
| Nested URL gives 404               | Nginx SPA `try_files` and `/api/` proxy location.                                                            |
| Old web build appears              | Rebuild with `VITE_API_URL=/api/v1`, correct release symlink and noncached index.html.                       |
| Receipt clips or prints on A4      | Match selected 80/58mm roll in printer driver, 100% scale, zero browser margins, headers/footers off.        |

Useful checks: `sudo journalctl -u phms-api -n 100 --no-pager`,
`sudo nginx -t`, `sudo ss -ltnp`, `df -h` and `free -h`.
Never paste unredacted environment files, passwords, patient payloads or database
dumps into support tickets.

## 12. Receipt paper and repository hygiene

Lab authorization defaults to **80mm roll**, with **58mm** selectable. Content has
4mm side padding (72mm/50mm content). Page length follows the order's rendered
content; each paid order is a separate slip. The design is grounded in Epson's
80mm/58mm roll specifications, but actual driver margins and cutters still need a
hardware test. [Epson TM-T20III technical guide](https://download4.epson.biz/sec_pubs/bs/pdf/TM-T20III_trg_en_revF.pdf)

The slip includes patient identity, age/sex, visit/order, requester, clearance and
tests/specimen types. It does not print prices, paid amounts or lab results.

Commit source, lockfile, migrations, `.env.example`, deployment configuration and
maintained operational/security docs. Exclude real `.env`, keys, dumps, backups,
build output, dependencies, design screenshots and historical milestone notes.
Ignored tracked files must also be removed from the Git index; ignoring alone
does not untrack them. Local excluded docs remain available to their owner.
Removing a file in a new commit does not erase old Git history or revoke secrets:
rotate any credential that was exposed; never reuse development credentials on
the VPS. Review `git diff --cached --name-status` before a deliberate push.

## Platform email verification and recovery

Before enabling password recovery, follow [Platform email recovery setup](PLATFORM_EMAIL_RECOVERY.md) to configure the SMTP sender, public web URL, migration, and mailbox smoke tests. Never commit SMTP credentials. Existing platform administrators must verify their registered email before requesting a reset link.
