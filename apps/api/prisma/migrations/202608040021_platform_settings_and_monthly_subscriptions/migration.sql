SELECT set_config('app.platform_admin', 'true', true);

GRANT INSERT, UPDATE ON public.platform_settings TO phms_app;

DROP TRIGGER IF EXISTS platform_settings_guard_write ON public.platform_settings;
CREATE TRIGGER platform_settings_guard_write
BEFORE INSERT OR UPDATE OR DELETE ON public.platform_settings
FOR EACH ROW EXECUTE FUNCTION app_private.require_platform_write();

INSERT INTO public.platform_settings (id, key, value, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'platform_profile', '{"displayName":"PHMS Platform","logoUrl":"","primaryColor":"#0D2926","accentColor":"#B8F39A","supportContact":""}'::jsonb, now(), now()),
  (gen_random_uuid(), 'billing', '{"paymentNumber":"","monthlyFee":"0","currencyCode":"USD","instructions":"Contact the platform administrator to renew access."}'::jsonb, now(), now())
ON CONFLICT (key) DO NOTHING;

UPDATE public.tenant_subscriptions
SET ends_at = now() + interval '1 month'
WHERE ends_at IS NULL;
