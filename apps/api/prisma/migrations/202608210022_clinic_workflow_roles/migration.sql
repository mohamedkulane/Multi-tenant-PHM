-- Role-specific outpatient clinic workflow.

ALTER TYPE public."TenantRole" RENAME TO "TenantRole_legacy";
CREATE TYPE public."TenantRole" AS ENUM ('OWNER', 'ADMIN', 'DOCTOR', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECHNICIAN');

ALTER TABLE public.tenant_memberships ALTER COLUMN role TYPE public."TenantRole"
  USING (CASE role::text WHEN 'MANAGER' THEN 'ADMIN' WHEN 'CASHIER' THEN 'RECEPTIONIST' WHEN 'AUDITOR' THEN 'ADMIN' ELSE role::text END)::public."TenantRole";
ALTER TABLE public.invitations ALTER COLUMN role TYPE public."TenantRole"
  USING (CASE role::text WHEN 'MANAGER' THEN 'ADMIN' WHEN 'CASHIER' THEN 'RECEPTIONIST' WHEN 'AUDITOR' THEN 'ADMIN' ELSE role::text END)::public."TenantRole";
ALTER TABLE public.platform_broadcasts ALTER COLUMN target_role TYPE public."TenantRole"
  USING (CASE target_role::text WHEN 'MANAGER' THEN 'ADMIN' WHEN 'CASHIER' THEN 'RECEPTIONIST' WHEN 'AUDITOR' THEN 'ADMIN' ELSE target_role::text END)::public."TenantRole";
DROP TYPE public."TenantRole_legacy";

CREATE TYPE public."ClinicVisitStatus" AS ENUM (
  'AWAITING_CONSULTATION_PAYMENT', 'WAITING_FOR_DOCTOR', 'IN_CONSULTATION',
  'AWAITING_LAB_PAYMENT', 'WAITING_FOR_LAB', 'LAB_IN_PROGRESS', 'RESULTS_READY',
  'PRESCRIPTION_READY', 'COMPLETED', 'CANCELLED'
);
CREATE TYPE public."ConsultationPaymentStatus" AS ENUM ('UNPAID', 'PAID');
CREATE TYPE public."SampleStatus" AS ENUM ('NOT_COLLECTED', 'COLLECTED');

CREATE TABLE public.clinic_visits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  visit_number varchar(80) NOT NULL,
  status public."ClinicVisitStatus" NOT NULL DEFAULT 'AWAITING_CONSULTATION_PAYMENT',
  consultation_fee numeric(19,4) NOT NULL,
  consultation_payment_status public."ConsultationPaymentStatus" NOT NULL DEFAULT 'UNPAID',
  consultation_payment_method public."PaymentMethod",
  consultation_paid_at timestamptz(3),
  consultation_collected_by_membership_id uuid,
  chief_complaint varchar(2000),
  history varchar(4000),
  examination varchar(4000),
  diagnosis varchar(2000),
  doctor_notes varchar(4000),
  assigned_doctor_membership_id uuid,
  registered_by_membership_id uuid NOT NULL,
  consultation_completed_at timestamptz(3),
  completed_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL,
  CONSTRAINT clinic_visits_pkey PRIMARY KEY (id),
  CONSTRAINT clinic_visits_fee_check CHECK (consultation_fee >= 0),
  CONSTRAINT clinic_visits_branch_fk FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT clinic_visits_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES public.patients(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT clinic_visits_registrar_fk FOREIGN KEY (tenant_id, registered_by_membership_id) REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT clinic_visits_doctor_fk FOREIGN KEY (tenant_id, assigned_doctor_membership_id) REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT clinic_visits_collector_fk FOREIGN KEY (tenant_id, consultation_collected_by_membership_id) REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX clinic_visits_tenant_id_id_key ON public.clinic_visits(tenant_id, id);
CREATE UNIQUE INDEX clinic_visits_tenant_id_visit_number_key ON public.clinic_visits(tenant_id, visit_number);
CREATE INDEX clinic_visits_tenant_id_branch_status_created_idx ON public.clinic_visits(tenant_id, branch_id, status, created_at);
CREATE INDEX clinic_visits_tenant_id_patient_created_idx ON public.clinic_visits(tenant_id, patient_id, created_at);

ALTER TABLE public.lab_visits
  ADD COLUMN clinic_visit_id uuid,
  ADD COLUMN sample_status public."SampleStatus" NOT NULL DEFAULT 'NOT_COLLECTED',
  ADD COLUMN sample_collected_at timestamptz(3),
  ADD COLUMN sample_collected_by_membership_id uuid,
  ADD CONSTRAINT lab_visits_clinic_visit_fk FOREIGN KEY (tenant_id, clinic_visit_id) REFERENCES public.clinic_visits(tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT lab_visits_sample_collector_fk FOREIGN KEY (tenant_id, sample_collected_by_membership_id) REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT;
CREATE INDEX lab_visits_tenant_id_clinic_visit_id_idx ON public.lab_visits(tenant_id, clinic_visit_id);

CREATE TABLE public.prescriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  clinic_visit_id uuid NOT NULL, prescribed_by_membership_id uuid NOT NULL, notes varchar(2000),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz(3) NOT NULL,
  CONSTRAINT prescriptions_pkey PRIMARY KEY (id),
  CONSTRAINT prescriptions_visit_fk FOREIGN KEY (tenant_id, clinic_visit_id) REFERENCES public.clinic_visits(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT prescriptions_branch_fk FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT prescriptions_prescriber_fk FOREIGN KEY (tenant_id, prescribed_by_membership_id) REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX prescriptions_tenant_id_id_key ON public.prescriptions(tenant_id, id);
CREATE UNIQUE INDEX prescriptions_tenant_id_clinic_visit_id_key ON public.prescriptions(tenant_id, clinic_visit_id);
CREATE INDEX prescriptions_tenant_id_branch_created_idx ON public.prescriptions(tenant_id, branch_id, created_at);

CREATE TABLE public.prescription_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, prescription_id uuid NOT NULL,
  medicine_name varchar(180) NOT NULL, dosage varchar(120) NOT NULL, frequency varchar(120) NOT NULL,
  duration varchar(120) NOT NULL, instructions varchar(500),
  CONSTRAINT prescription_items_pkey PRIMARY KEY (id),
  CONSTRAINT prescription_items_prescription_fk FOREIGN KEY (tenant_id, prescription_id) REFERENCES public.prescriptions(tenant_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX prescription_items_tenant_id_id_key ON public.prescription_items(tenant_id, id);
CREATE INDEX prescription_items_tenant_id_prescription_idx ON public.prescription_items(tenant_id, prescription_id);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['clinic_visits', 'prescriptions', 'prescription_items'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I USING (tenant_id = app_private.current_tenant_id()) WITH CHECK (tenant_id = app_private.current_tenant_id())', table_name || '_tenant_isolation', table_name);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'phms_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.clinic_visits, public.prescriptions, public.prescription_items TO phms_app;
  END IF;
END $$;