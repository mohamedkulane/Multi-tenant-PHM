-- Add PHMS's canonical electronic payment methods without rewriting or deleting
-- truthful historical transactions that used legacy methods.
ALTER TYPE public."PaymentMethod" ADD VALUE IF NOT EXISTS 'EVC_PLUS';
ALTER TYPE public."PaymentMethod" ADD VALUE IF NOT EXISTS 'E_DAHAB';
ALTER TYPE public."PaymentMethod" ADD VALUE IF NOT EXISTS 'SALAAM_BANK';

-- New writes are restricted in the API. Legacy enum values intentionally remain
-- available only so historical payments, refunds, and receipts remain readable.
