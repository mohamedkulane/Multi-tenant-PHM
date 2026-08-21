-- Production-safe clinical workflow expansion.
-- This migration only adds new objects/columns and preserves existing pharmacy, lab and clinic data.

ALTER TYPE public."LabResultStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE public."ClinicVisitStatus" ADD VALUE IF NOT EXISTS 'IN_EXAMINATION';
ALTER TYPE public."ClinicVisitStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_SAMPLE';
ALTER TYPE public."ClinicVisitStatus" ADD VALUE IF NOT EXISTS 'LAB_RESULTS_READY';
ALTER TYPE public."ClinicVisitStatus" ADD VALUE IF NOT EXISTS 'DOCTOR_REVIEW';
ALTER TYPE public."ClinicVisitStatus" ADD VALUE IF NOT EXISTS 'PRESCRIPTION_CREATED';
ALTER TYPE public."ClinicVisitStatus" ADD VALUE IF NOT EXISTS 'AT_PHARMACY';

CREATE TYPE public."LabResultType" AS ENUM ('POSITIVE_NEGATIVE', 'NUMERIC', 'TEXT', 'SELECT', 'PANEL');
CREATE TYPE public."LabInterpretation" AS ENUM ('NORMAL', 'ABNORMAL', 'HIGH', 'LOW', 'POSITIVE', 'NEGATIVE', 'CRITICAL', 'INCONCLUSIVE', 'BORDERLINE');
CREATE TYPE public."LabOrderPriority" AS ENUM ('ROUTINE', 'URGENT', 'STAT');
CREATE TYPE public."DiagnosisType" AS ENUM ('PROVISIONAL', 'DIFFERENTIAL', 'FINAL');
CREATE TYPE public."PrescriptionStatus" AS ENUM ('NOT_DISPENSED', 'PARTIALLY_DISPENSED', 'DISPENSED', 'CANCELLED');
CREATE TYPE public."PrescriptionItemStatus" AS ENUM ('PENDING', 'PARTIALLY_DISPENSED', 'DISPENSED', 'NOT_AVAILABLE', 'CANCELLED');
CREATE TYPE public."ClinicalPaymentType" AS ENUM ('CONSULTATION', 'LAB');
CREATE TYPE public."ClinicalPaymentStatus" AS ENUM ('PAID', 'VOIDED');

ALTER TABLE public.patients NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public.patients
  ADD COLUMN patient_number varchar(40),
  ADD COLUMN date_of_birth date,
  ADD COLUMN address varchar(500),
  ADD COLUMN emergency_contact_name varchar(180),
  ADD COLUMN emergency_contact_phone varchar(40),
  ADD COLUMN blood_group varchar(10),
  ADD COLUMN allergies varchar(2000);

WITH numbered AS (
  SELECT id, tenant_id,
         row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id) AS sequence_number
  FROM public.patients
)
UPDATE public.patients AS patient
SET patient_number = 'PT-' || lpad(numbered.sequence_number::text, 6, '0')
FROM numbered
WHERE patient.id = numbered.id AND patient.tenant_id = numbered.tenant_id;

ALTER TABLE public.patients ALTER COLUMN patient_number SET NOT NULL;
ALTER TABLE public.patients FORCE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX patients_tenant_id_patient_number_key
  ON public.patients(tenant_id, patient_number);

ALTER TABLE public.lab_tests NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public.lab_tests
  ADD COLUMN code varchar(40),
  ADD COLUMN description varchar(1000),
  ADD COLUMN sample_type varchar(80),
  ADD COLUMN result_type public."LabResultType" NOT NULL DEFAULT 'POSITIVE_NEGATIVE',
  ADD COLUMN unit varchar(80),
  ADD COLUMN reference_range varchar(180),
  ADD COLUMN result_options jsonb,
  ADD COLUMN panel_components jsonb;

WITH numbered AS (
  SELECT id, tenant_id,
         row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id) AS sequence_number
  FROM public.lab_tests
)
UPDATE public.lab_tests AS test
SET code = 'LT-' || lpad(numbered.sequence_number::text, 6, '0')
FROM numbered
WHERE test.id = numbered.id AND test.tenant_id = numbered.tenant_id;

ALTER TABLE public.lab_tests ALTER COLUMN code SET NOT NULL;
ALTER TABLE public.lab_tests FORCE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX lab_tests_tenant_id_code_key ON public.lab_tests(tenant_id, code);

ALTER TABLE public.lab_visits
  ADD COLUMN priority public."LabOrderPriority" NOT NULL DEFAULT 'ROUTINE',
  ADD COLUMN requested_by_membership_id uuid,
  ADD COLUMN sample_type varchar(80),
  ADD COLUMN sample_id varchar(80),
  ADD COLUMN sample_notes varchar(1000),
  ADD CONSTRAINT lab_visits_requester_fk
    FOREIGN KEY (tenant_id, requested_by_membership_id)
    REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE public.lab_visit_tests
  ADD COLUMN result_type public."LabResultType" NOT NULL DEFAULT 'POSITIVE_NEGATIVE',
  ADD COLUMN result_value varchar(1000),
  ADD COLUMN numeric_value numeric(19,6),
  ADD COLUMN unit varchar(80),
  ADD COLUMN reference_range varchar(180),
  ADD COLUMN interpretation public."LabInterpretation",
  ADD COLUMN result_data jsonb;

ALTER TABLE public.lab_visit_tests NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lab_tests NO FORCE ROW LEVEL SECURITY;

UPDATE public.lab_visit_tests AS item
SET result_type = test.result_type,
    unit = test.unit,
    reference_range = test.reference_range
FROM public.lab_tests AS test
WHERE item.tenant_id = test.tenant_id AND item.lab_test_id = test.id;

ALTER TABLE public.lab_visit_tests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lab_tests FORCE ROW LEVEL SECURITY;

CREATE TABLE public.clinical_assessments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  clinic_visit_id uuid NOT NULL,
  chief_complaint varchar(2000) NOT NULL,
  history_present_illness varchar(6000),
  past_medical_history varchar(4000),
  past_surgical_history varchar(4000),
  current_medicines varchar(4000),
  allergies varchar(4000),
  symptoms jsonb NOT NULL DEFAULT '[]'::jsonb,
  vital_signs jsonb NOT NULL DEFAULT '{}'::jsonb,
  physical_examination jsonb NOT NULL DEFAULT '{}'::jsonb,
  examination_notes varchar(6000),
  provisional_diagnosis varchar(3000),
  created_by_membership_id uuid NOT NULL,
  updated_by_membership_id uuid NOT NULL,
  started_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL,
  CONSTRAINT clinical_assessments_pkey PRIMARY KEY (id),
  CONSTRAINT clinical_assessments_visit_fk
    FOREIGN KEY (tenant_id, clinic_visit_id)
    REFERENCES public.clinic_visits(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT clinical_assessments_creator_fk
    FOREIGN KEY (tenant_id, created_by_membership_id)
    REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT clinical_assessments_updater_fk
    FOREIGN KEY (tenant_id, updated_by_membership_id)
    REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX clinical_assessments_tenant_id_id_key ON public.clinical_assessments(tenant_id, id);
CREATE UNIQUE INDEX clinical_assessments_tenant_id_clinic_visit_id_key ON public.clinical_assessments(tenant_id, clinic_visit_id);
CREATE INDEX clinical_assessments_tenant_id_created_at_idx ON public.clinical_assessments(tenant_id, created_at);

CREATE TABLE public.diagnoses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  clinic_visit_id uuid NOT NULL,
  type public."DiagnosisType" NOT NULL,
  description varchar(3000) NOT NULL,
  code varchar(40),
  recorded_by_membership_id uuid NOT NULL,
  recorded_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT diagnoses_pkey PRIMARY KEY (id),
  CONSTRAINT diagnoses_visit_fk
    FOREIGN KEY (tenant_id, clinic_visit_id)
    REFERENCES public.clinic_visits(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT diagnoses_recorder_fk
    FOREIGN KEY (tenant_id, recorded_by_membership_id)
    REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX diagnoses_tenant_id_id_key ON public.diagnoses(tenant_id, id);
CREATE INDEX diagnoses_tenant_visit_type_recorded_idx
  ON public.diagnoses(tenant_id, clinic_visit_id, type, recorded_at);

CREATE TABLE public.clinical_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  clinic_visit_id uuid NOT NULL,
  lab_visit_id uuid,
  type public."ClinicalPaymentType" NOT NULL,
  status public."ClinicalPaymentStatus" NOT NULL DEFAULT 'PAID',
  receipt_number varchar(80) NOT NULL,
  amount numeric(19,4) NOT NULL,
  method public."PaymentMethod" NOT NULL,
  external_reference varchar(180),
  idempotency_key varchar(120) NOT NULL,
  notes varchar(500),
  collected_by_membership_id uuid NOT NULL,
  collected_by_user_id uuid NOT NULL,
  paid_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT clinical_payments_pkey PRIMARY KEY (id),
  CONSTRAINT clinical_payments_positive_amount CHECK (amount >= 0),
  CONSTRAINT clinical_payments_branch_fk
    FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT clinical_payments_patient_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES public.patients(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT clinical_payments_visit_fk
    FOREIGN KEY (tenant_id, clinic_visit_id) REFERENCES public.clinic_visits(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT clinical_payments_lab_visit_fk
    FOREIGN KEY (tenant_id, lab_visit_id) REFERENCES public.lab_visits(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT clinical_payments_collector_fk
    FOREIGN KEY (tenant_id, collected_by_membership_id) REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT clinical_payments_user_fk
    FOREIGN KEY (collected_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX clinical_payments_tenant_id_id_key ON public.clinical_payments(tenant_id, id);
CREATE UNIQUE INDEX clinical_payments_tenant_id_receipt_number_key ON public.clinical_payments(tenant_id, receipt_number);
CREATE UNIQUE INDEX clinical_payments_tenant_id_idempotency_key_key ON public.clinical_payments(tenant_id, idempotency_key);
CREATE INDEX clinical_payments_tenant_branch_paid_idx ON public.clinical_payments(tenant_id, branch_id, paid_at);
CREATE INDEX clinical_payments_tenant_visit_type_idx ON public.clinical_payments(tenant_id, clinic_visit_id, type);

ALTER TABLE public.prescriptions NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public.prescriptions
  ADD COLUMN prescription_number varchar(80),
  ADD COLUMN status public."PrescriptionStatus" NOT NULL DEFAULT 'NOT_DISPENSED',
  ADD COLUMN diagnosis_snapshot varchar(3000),
  ADD COLUMN dispensed_at timestamptz(3);

WITH numbered AS (
  SELECT id, tenant_id,
         row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id) AS sequence_number
  FROM public.prescriptions
)
UPDATE public.prescriptions AS prescription
SET prescription_number = 'RX-' || EXTRACT(YEAR FROM prescription.created_at)::int::text || '-' ||
                          lpad(numbered.sequence_number::text, 6, '0')
FROM numbered
WHERE prescription.id = numbered.id AND prescription.tenant_id = numbered.tenant_id;

ALTER TABLE public.prescriptions ALTER COLUMN prescription_number SET NOT NULL;
ALTER TABLE public.prescriptions FORCE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX prescriptions_tenant_id_prescription_number_key
  ON public.prescriptions(tenant_id, prescription_number);

ALTER TABLE public.prescription_items
  ADD COLUMN strength varchar(120),
  ADD COLUMN route varchar(80),
  ADD COLUMN quantity numeric(19,4),
  ADD COLUMN status public."PrescriptionItemStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN mapped_product_id uuid,
  ADD COLUMN mapped_package_code varchar(40),
  ADD COLUMN dispensed_quantity numeric(19,4) NOT NULL DEFAULT 0,
  ADD CONSTRAINT prescription_items_quantity_check CHECK (quantity IS NULL OR quantity >= 0),
  ADD CONSTRAINT prescription_items_dispensed_quantity_check CHECK (dispensed_quantity >= 0),
  ADD CONSTRAINT prescription_items_product_fk
    FOREIGN KEY (tenant_id, mapped_product_id) REFERENCES public.products(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE public.sales
  ADD COLUMN clinic_visit_id uuid,
  ADD COLUMN prescription_id uuid,
  ADD CONSTRAINT sales_clinic_visit_fk
    FOREIGN KEY (tenant_id, clinic_visit_id) REFERENCES public.clinic_visits(tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT sales_prescription_fk
    FOREIGN KEY (tenant_id, prescription_id) REFERENCES public.prescriptions(tenant_id, id) ON DELETE RESTRICT;
CREATE INDEX sales_tenant_prescription_created_idx ON public.sales(tenant_id, prescription_id, created_at);
CREATE INDEX sales_tenant_clinic_visit_created_idx ON public.sales(tenant_id, clinic_visit_id, created_at);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['clinical_assessments', 'diagnoses', 'clinical_payments'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I USING (tenant_id = app_private.current_tenant_id()) WITH CHECK (tenant_id = app_private.current_tenant_id())',
      table_name || '_tenant_isolation',
      table_name
    );
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'phms_app') THEN
    GRANT SELECT, INSERT, UPDATE ON
      public.clinical_assessments,
      public.diagnoses,
      public.clinical_payments
    TO phms_app;
  END IF;
END $$;
