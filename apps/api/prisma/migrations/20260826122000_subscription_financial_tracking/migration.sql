ALTER TABLE public.tenant_subscriptions
  ADD COLUMN monthly_fee numeric(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN last_payment_amount numeric(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN last_paid_at timestamptz(3);

ALTER TABLE public.tenant_subscriptions
  ADD CONSTRAINT tenant_subscription_monthly_fee_check CHECK (monthly_fee >= 0),
  ADD CONSTRAINT tenant_subscription_last_payment_check CHECK (last_payment_amount >= 0);