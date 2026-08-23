-- Laboratory sensitivity, specimen quality, and immutable result amendment history.
ALTER TYPE "SampleStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "SampleStatus" ADD VALUE IF NOT EXISTS 'RECOLLECTION_REQUIRED';
CREATE TYPE "SampleCondition" AS ENUM (
  'ACCEPTABLE', 'HEMOLYZED', 'CLOTTED', 'INSUFFICIENT', 'CONTAMINATED',
  'LEAKING', 'WRONG_CONTAINER', 'OTHER'
);
CREATE TYPE "LabSensitivity" AS ENUM ('NORMAL', 'SENSITIVE', 'RESTRICTED');

ALTER TABLE public.lab_tests
  ADD COLUMN sensitivity "LabSensitivity" NOT NULL DEFAULT 'NORMAL';

ALTER TABLE public.lab_visit_tests
  ADD COLUMN sample_status "SampleStatus" NOT NULL DEFAULT 'NOT_COLLECTED',
  ADD COLUMN sample_condition "SampleCondition",
  ADD COLUMN rejection_reason varchar(1000),
  ADD CONSTRAINT lab_visit_test_rejection_check CHECK (
    sample_status NOT IN ('REJECTED', 'RECOLLECTION_REQUIRED')
    OR length(btrim(rejection_reason)) > 0
  );

UPDATE public.lab_visit_tests
SET sample_status = 'COLLECTED', sample_condition = 'ACCEPTABLE'
WHERE sample_collected_at IS NOT NULL;

CREATE TABLE public.lab_result_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  visit_test_id uuid NOT NULL,
  original_result jsonb NOT NULL,
  amended_result jsonb NOT NULL,
  reason varchar(1000) NOT NULL,
  amended_by_membership_id uuid NOT NULL,
  amended_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT lab_result_amendments_test_fk
    FOREIGN KEY (tenant_id, visit_test_id) REFERENCES public.lab_visit_tests(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lab_result_amendments_actor_fk
    FOREIGN KEY (tenant_id, amended_by_membership_id) REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lab_result_amendments_reason_check CHECK (length(btrim(reason)) >= 3)
);
CREATE UNIQUE INDEX lab_result_amendments_tenant_id_id_key
  ON public.lab_result_amendments(tenant_id, id);
CREATE INDEX lab_result_amendments_tenant_test_amended_idx
  ON public.lab_result_amendments(tenant_id, visit_test_id, amended_at);
ALTER TABLE public.lab_result_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_result_amendments FORCE ROW LEVEL SECURITY;
CREATE POLICY lab_result_amendments_tenant_isolation ON public.lab_result_amendments
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'phms_app') THEN
    GRANT SELECT, INSERT ON public.lab_result_amendments TO phms_app;
  END IF;
END $$;