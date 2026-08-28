# Platform email verification and password recovery

Applies only to provisioned platform administrators (SUPER_ADMIN and ADMIN). This is not public registration and does not grant a role. Tenant login is unchanged.

## Deploy

1. Install the lockfile (`npm ci`), stop the API, apply migrations with the database migration role (`npm run db:deploy -w @phms/api`), and generate the client (`npm run db:generate`). Never use `db push` or reset a production database.
2. Configure the following **on the server only** in the API environment, using your email provider's SMTP credentials:

   ```dotenv
   PLATFORM_WEB_URL=https://your-phms-domain.example
   SMTP_HOST=smtp.your-provider.example
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=provider-smtp-user
   SMTP_PASSWORD=provider-smtp-password
   SMTP_FROM=accounts@your-domain.example
   ```

   For implicit TLS on port 465, use `SMTP_SECURE=true`. Port 587 requires STARTTLS. Certificate validation is enabled. Production links require HTTPS. Use a sender authorized by your provider and configure SPF/DKIM. Do not use the API URL for `PLATFORM_WEB_URL`; this must be the browser application's public URL. Keep the web origin in `WEB_ORIGINS` as well.

3. Build and restart the API and web deployment. Configure SPA fallback for `/platform/*` URLs. SMTP values are optional for ordinary login, but all must be present to request recovery email. Missing configuration returns an actionable `EMAIL_DELIVERY_UNAVAILABLE` error without exposing credentials.
4. Newly provisioned and existing administrators start **unverified**. They can still sign in. From login, choose **Verify my email**, enter the registered address, then open the email link and explicitly confirm ownership. The dashboard also reminds unverified administrators. Verification does not sign them in.
5. After verification, **Forgot password** sends a separate reset link. Choose a password of at least 16 characters and confirm it. Sign in normally afterward. Other platform and support sessions are revoked.

## Security and operational behavior

- Links have 256-bit random secrets; only hashes are stored. Verification expires in 60 minutes and reset links in 20 minutes. Links are single-use and bound to the user's current email and password version. Issuing a new link replaces the previous one of the same kind.
- Responses do not reveal whether an email exists. Email requests run asynchronously after the generic response; a 202 response is not proof of delivery. Look for `PLATFORM_RECOVERY_REQUEST_FAILED` or `PLATFORM_RECOVERY_DELIVERY_FAILED` in API logs if emails do not arrive. Raw links, provider errors, passwords and message bodies are not logged. Requests are not a durable queue: if the API restarts during delivery, request a new link after one minute.
- A persisted one-minute per-account cooldown and 10 requests per IP per 15 minutes limit abuse. IP counters are per API process; use a single API instance or a shared/edge rate limiter for horizontally scaled deployments. Configure `TRUST_PROXY_HOPS` only for your trusted reverse proxy.
- Tokens use URL fragments, are removed from the address bar after opening, and are consumed only by an explicit POST. If the page is refreshed, reopen the full email link. Automatic email-link scanners do not consume tokens.
- User-row locks serialize issue/consume and login against password resets. Email changes invalidate previous verification by comparison with the verified address. Password changes invalidate pending links through tokenVersion.
- No real SMTP credentials or live mailbox were available during automated tests. Before production, verify delivery to an account you control, then check expired links, reused links, password confirmation, and old-session logout. Do not enable production delivery until those smoke tests pass.

Design reference: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Dependency security note

The dependency audit still reports three high-severity entries in the `prisma → @prisma/config → deepmerge-ts` chain for [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx). The patched version is deepmerge-ts 8.0.0, but npm did not apply attempted overrides to this workspace's existing resolution. No ineffective override is committed, and Prisma was not forcibly downgraded. This requires a separately validated dependency upgrade; do not call the audit clean. Prisma loads this dependency to merge local configuration; this application does not pass user-controlled cyclic objects to it. Compatible fixes for the other two dependency advisories were applied.
