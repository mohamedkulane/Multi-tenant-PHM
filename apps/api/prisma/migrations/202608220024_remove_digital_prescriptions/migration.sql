-- Digital medical prescriptions are intentionally outside PHMS.
-- Preserve an owner-only historical snapshot before removing the active domain.
CREATE TABLE app_private.legacy_prescription_archives (
  prescription_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  clinic_visit_id uuid NOT NULL,
  archived_at timestamptz(3) NOT NULL DEFAULT now(),
  payload jsonb NOT NULL
);

REVOKE ALL ON app_private.legacy_prescription_archives FROM PUBLIC;
REVOKE ALL ON app_private.legacy_prescription_archives FROM phms_app;

INSERT INTO app_private.legacy_prescription_archives (
  prescription_id,
  tenant_id,
  clinic_visit_id,
  payload
)
SELECT
  prescription.id,
  prescription.tenant_id,
  prescription.clinic_visit_id,
  jsonb_build_object(
    'prescription', to_jsonb(prescription),
    'items', COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id)
        FROM public.prescription_items AS item
        WHERE item.tenant_id = prescription.tenant_id
          AND item.prescription_id = prescription.id
      ),
      '[]'::jsonb
    ),
    'linkedSaleIds', COALESCE(
      (
        SELECT jsonb_agg(sale.id ORDER BY sale.created_at)
        FROM public.sales AS sale
        WHERE sale.tenant_id = prescription.tenant_id
          AND sale.prescription_id = prescription.id
      ),
      '[]'::jsonb
    )
  )
FROM public.prescriptions AS prescription;

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_prescription_fk;
DROP INDEX IF EXISTS public.sales_tenant_prescription_created_idx;
ALTER TABLE public.sales DROP COLUMN IF EXISTS prescription_id;

DROP TABLE public.prescription_items;
DROP TABLE public.prescriptions;
DROP TYPE public."PrescriptionItemStatus";
DROP TYPE public."PrescriptionStatus";

-- Visits that previously waited for dispensing are clinically complete.
CREATE TEMP TABLE visits_completed_outside_phms (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO visits_completed_outside_phms (id)
SELECT id FROM public.clinic_visits
WHERE status::text IN ('PRESCRIPTION_CREATED', 'PRESCRIPTION_READY', 'AT_PHARMACY');

UPDATE public.clinic_visits
SET status = 'COMPLETED', completed_at = COALESCE(completed_at, now())
WHERE id IN (SELECT id FROM visits_completed_outside_phms);

ALTER TABLE public.clinic_visits ALTER COLUMN status DROP DEFAULT;
ALTER TYPE public."ClinicVisitStatus" RENAME TO "ClinicVisitStatus_legacy";
CREATE TYPE public."ClinicVisitStatus" AS ENUM (
  'AWAITING_CONSULTATION_PAYMENT',
  'WAITING_FOR_DOCTOR',
  'IN_CONSULTATION',
  'IN_EXAMINATION',
  'AWAITING_LAB_PAYMENT',
  'WAITING_FOR_LAB',
  'WAITING_FOR_SAMPLE',
  'LAB_IN_PROGRESS',
  'RESULTS_READY',
  'LAB_RESULTS_READY',
  'DOCTOR_REVIEW',
  'COMPLETED',
  'CANCELLED'
);
ALTER TABLE public.clinic_visits
  ALTER COLUMN status TYPE public."ClinicVisitStatus"
  USING status::text::public."ClinicVisitStatus";
ALTER TABLE public.clinic_visits
  ALTER COLUMN status SET DEFAULT 'AWAITING_CONSULTATION_PAYMENT'::public."ClinicVisitStatus";
DROP TYPE public."ClinicVisitStatus_legacy";
