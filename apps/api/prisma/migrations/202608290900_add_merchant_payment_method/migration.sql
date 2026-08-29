ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'MERCHANT';

ALTER TABLE "tenant_branding"
  ALTER COLUMN "payment_methods"
  SET DEFAULT '["EVC_PLUS","E_DAHAB","SALAAM_BANK","MERCHANT"]'::jsonb;

UPDATE "tenant_branding"
SET "payment_methods" = "payment_methods" || '["MERCHANT"]'::jsonb
WHERE jsonb_typeof("payment_methods") = 'array'
  AND NOT ("payment_methods" @> '["MERCHANT"]'::jsonb);
