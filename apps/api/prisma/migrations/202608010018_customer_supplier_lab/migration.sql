-- M12 customer accounts, suppliers, laboratory workflow, invoice settings and discount controls.

CREATE TYPE "LabVisitStatus" AS ENUM ('REGISTERED', 'RESULTS_PENDING', 'COMPLETED', 'CANCELLED');
CREATE TYPE "LabResultStatus" AS ENUM ('PENDING', 'NEGATIVE', 'POSITIVE', 'INCONCLUSIVE');

ALTER TABLE public.tenant_branding
  ADD COLUMN invoice_paper_size varchar(20) NOT NULL DEFAULT 'A4',
  ADD COLUMN invoice_show_logo boolean NOT NULL DEFAULT true,
  ADD COLUMN invoice_title varchar(120) NOT NULL DEFAULT 'SALES INVOICE',
  ADD COLUMN pharmacist_discount_percent decimal(5,2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT tenant_branding_invoice_paper_check
    CHECK (invoice_paper_size IN ('A4', 'A5', 'THERMAL_80MM')),
  ADD CONSTRAINT tenant_branding_discount_check
    CHECK (pharmacist_discount_percent >= 0 AND pharmacist_discount_percent <= 100);

CREATE TABLE public.customers (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  name varchar(180) NOT NULL,
  phone varchar(40) NOT NULL,
  address varchar(300),
  notes varchar(1000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL,
  CONSTRAINT customers_pkey PRIMARY KEY (id),
  CONSTRAINT customers_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT,
  CONSTRAINT customers_name_phone_check CHECK (length(btrim(name)) >= 2 AND length(btrim(phone)) >= 3)
);
CREATE UNIQUE INDEX customers_tenant_id_id_key ON public.customers(tenant_id, id);
CREATE UNIQUE INDEX customers_tenant_id_phone_key ON public.customers(tenant_id, phone);
CREATE INDEX customers_tenant_id_name_active_idx ON public.customers(tenant_id, name, active);

ALTER TABLE public.sales ADD COLUMN customer_id uuid;
ALTER TABLE public.sales ADD CONSTRAINT sales_customer_fkey
  FOREIGN KEY (tenant_id, customer_id) REFERENCES public.customers(tenant_id, id) ON DELETE RESTRICT;
CREATE INDEX sales_tenant_id_customer_id_created_at_idx ON public.sales(tenant_id, customer_id, created_at);

CREATE TABLE public.suppliers (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  name varchar(180) NOT NULL,
  contact_person varchar(180),
  phone varchar(40),
  email varchar(320),
  address varchar(500),
  notes varchar(1000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL,
  CONSTRAINT suppliers_pkey PRIMARY KEY (id),
  CONSTRAINT suppliers_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT,
  CONSTRAINT suppliers_name_check CHECK (length(btrim(name)) >= 2)
);
CREATE UNIQUE INDEX suppliers_tenant_id_id_key ON public.suppliers(tenant_id, id);
CREATE UNIQUE INDEX suppliers_tenant_id_name_key ON public.suppliers(tenant_id, name);
CREATE INDEX suppliers_tenant_id_active_name_idx ON public.suppliers(tenant_id, active, name);
ALTER TABLE public.inventory_receipts ADD COLUMN supplier_id uuid;
ALTER TABLE public.inventory_receipts ADD CONSTRAINT inventory_receipts_supplier_fkey
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES public.suppliers(tenant_id, id) ON DELETE RESTRICT;

CREATE TABLE public.lab_categories (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  name varchar(150) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL,
  CONSTRAINT lab_categories_pkey PRIMARY KEY (id),
  CONSTRAINT lab_categories_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT,
  CONSTRAINT lab_categories_name_check CHECK (length(btrim(name)) >= 2)
);
CREATE UNIQUE INDEX lab_categories_tenant_id_id_key ON public.lab_categories(tenant_id, id);
CREATE UNIQUE INDEX lab_categories_tenant_id_name_key ON public.lab_categories(tenant_id, name);
CREATE INDEX lab_categories_tenant_id_active_idx ON public.lab_categories(tenant_id, active);

CREATE TABLE public.lab_tests (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  category_id uuid NOT NULL,
  name varchar(180) NOT NULL,
  price decimal(19,4) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL,
  CONSTRAINT lab_tests_pkey PRIMARY KEY (id),
  CONSTRAINT lab_tests_category_fkey FOREIGN KEY (tenant_id, category_id)
    REFERENCES public.lab_categories(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lab_tests_value_check CHECK (length(btrim(name)) >= 2 AND price >= 0)
);
CREATE UNIQUE INDEX lab_tests_tenant_id_id_key ON public.lab_tests(tenant_id, id);
CREATE UNIQUE INDEX lab_tests_tenant_id_category_id_name_key ON public.lab_tests(tenant_id, category_id, name);
CREATE INDEX lab_tests_tenant_id_active_name_idx ON public.lab_tests(tenant_id, active, name);

CREATE TABLE public.patients (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  name varchar(180) NOT NULL,
  age integer NOT NULL,
  sex varchar(20),
  phone varchar(40),
  notes varchar(1000),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL,
  CONSTRAINT patients_pkey PRIMARY KEY (id),
  CONSTRAINT patients_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT,
  CONSTRAINT patients_value_check CHECK (length(btrim(name)) >= 2 AND age BETWEEN 0 AND 130)
);
CREATE UNIQUE INDEX patients_tenant_id_id_key ON public.patients(tenant_id, id);
CREATE INDEX patients_tenant_id_name_phone_idx ON public.patients(tenant_id, name, phone);

CREATE TABLE public.lab_visits (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  visit_number varchar(80) NOT NULL,
  status "LabVisitStatus" NOT NULL DEFAULT 'REGISTERED',
  clinical_notes varchar(2000),
  subtotal decimal(19,4) NOT NULL,
  discount decimal(19,4) NOT NULL DEFAULT 0,
  total decimal(19,4) NOT NULL,
  amount_paid decimal(19,4) NOT NULL DEFAULT 0,
  payment_method "PaymentMethod",
  registered_by_membership_id uuid NOT NULL,
  completed_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL,
  CONSTRAINT lab_visits_pkey PRIMARY KEY (id),
  CONSTRAINT lab_visits_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lab_visits_patient_fkey FOREIGN KEY (tenant_id, patient_id) REFERENCES public.patients(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lab_visits_registrar_fkey FOREIGN KEY (tenant_id, registered_by_membership_id) REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lab_visits_money_check CHECK (subtotal >= 0 AND discount >= 0 AND discount <= subtotal AND total = subtotal - discount AND amount_paid >= 0 AND amount_paid <= total)
);
CREATE UNIQUE INDEX lab_visits_tenant_id_id_key ON public.lab_visits(tenant_id, id);
CREATE UNIQUE INDEX lab_visits_tenant_id_visit_number_key ON public.lab_visits(tenant_id, visit_number);
CREATE INDEX lab_visits_tenant_id_branch_id_created_at_idx ON public.lab_visits(tenant_id, branch_id, created_at);
CREATE INDEX lab_visits_tenant_id_patient_id_created_at_idx ON public.lab_visits(tenant_id, patient_id, created_at);

CREATE TABLE public.lab_visit_tests (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  visit_id uuid NOT NULL,
  lab_test_id uuid NOT NULL,
  test_name varchar(180) NOT NULL,
  category_name varchar(150) NOT NULL,
  price decimal(19,4) NOT NULL,
  result_status "LabResultStatus" NOT NULL DEFAULT 'PENDING',
  result_note varchar(1000),
  marked_at timestamptz(3),
  marked_by_membership_id uuid,
  CONSTRAINT lab_visit_tests_pkey PRIMARY KEY (id),
  CONSTRAINT lab_visit_tests_visit_fkey FOREIGN KEY (tenant_id, visit_id) REFERENCES public.lab_visits(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lab_visit_tests_catalog_fkey FOREIGN KEY (tenant_id, lab_test_id) REFERENCES public.lab_tests(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lab_visit_tests_marker_fkey FOREIGN KEY (tenant_id, marked_by_membership_id) REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lab_visit_tests_price_check CHECK (price >= 0)
);
CREATE UNIQUE INDEX lab_visit_tests_tenant_id_id_key ON public.lab_visit_tests(tenant_id, id);
CREATE UNIQUE INDEX lab_visit_tests_tenant_id_visit_id_lab_test_id_key ON public.lab_visit_tests(tenant_id, visit_id, lab_test_id);
CREATE INDEX lab_visit_tests_tenant_id_visit_id_idx ON public.lab_visit_tests(tenant_id, visit_id);

CREATE TABLE public.prescriptions (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  visit_id uuid NOT NULL,
  notes varchar(2000),
  prescribed_by_membership_id uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL,
  CONSTRAINT prescriptions_pkey PRIMARY KEY (id),
  CONSTRAINT prescriptions_visit_fkey FOREIGN KEY (tenant_id, visit_id) REFERENCES public.lab_visits(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT prescriptions_prescriber_fkey FOREIGN KEY (tenant_id, prescribed_by_membership_id) REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX prescriptions_tenant_id_id_key ON public.prescriptions(tenant_id, id);
CREATE UNIQUE INDEX prescriptions_tenant_id_visit_id_key ON public.prescriptions(tenant_id, visit_id);

CREATE TABLE public.prescription_items (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  prescription_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_name varchar(180) NOT NULL,
  dosage varchar(120) NOT NULL,
  frequency varchar(120) NOT NULL,
  duration varchar(120) NOT NULL,
  instructions varchar(500),
  CONSTRAINT prescription_items_pkey PRIMARY KEY (id),
  CONSTRAINT prescription_items_prescription_fkey FOREIGN KEY (tenant_id, prescription_id) REFERENCES public.prescriptions(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT prescription_items_product_fkey FOREIGN KEY (tenant_id, product_id) REFERENCES public.products(tenant_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX prescription_items_tenant_id_id_key ON public.prescription_items(tenant_id, id);
CREATE INDEX prescription_items_tenant_id_prescription_id_idx ON public.prescription_items(tenant_id, prescription_id);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'customers', 'suppliers', 'lab_categories', 'lab_tests', 'patients',
    'lab_visits', 'lab_visit_tests', 'prescriptions', 'prescription_items'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I USING (tenant_id = app_private.current_tenant_id()) WITH CHECK (tenant_id = app_private.current_tenant_id())',
      table_name || '_tenant_isolation', table_name
    );
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'phms_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.customers, public.suppliers, public.lab_categories,
      public.lab_tests, public.patients, public.lab_visits, public.lab_visit_tests,
      public.prescriptions, public.prescription_items TO phms_app;
  END IF;
END $$;
