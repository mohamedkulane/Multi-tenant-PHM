ALTER TABLE public.tenant_branding
  ADD COLUMN consultation_fee numeric(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN payment_methods jsonb NOT NULL DEFAULT '["EVC_PLUS","E_DAHAB","SALAAM_BANK"]'::jsonb;

ALTER TABLE public.tenant_branding
  ADD CONSTRAINT tenant_branding_consultation_fee_check CHECK (consultation_fee >= 0),
  ADD CONSTRAINT tenant_branding_payment_methods_check CHECK (
    jsonb_typeof(payment_methods) = 'array' AND jsonb_array_length(payment_methods) > 0
  );