CREATE TABLE public.lab_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  visit_id uuid NOT NULL,
  amount numeric(19,4) NOT NULL,
  method public."PaymentMethod" NOT NULL,
  external_reference varchar(180),
  notes varchar(500),
  idempotency_key varchar(120) NOT NULL,
  collected_by_membership_id uuid NOT NULL,
  collected_by_user_id uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT lab_payments_amount_positive CHECK (amount > 0),
  CONSTRAINT lab_payments_visit_fk FOREIGN KEY (tenant_id, visit_id)
    REFERENCES public.lab_visits(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lab_payments_branch_fk FOREIGN KEY (tenant_id, branch_id)
    REFERENCES public.branches(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lab_payments_membership_fk FOREIGN KEY (tenant_id, collected_by_membership_id)
    REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lab_payments_user_fk FOREIGN KEY (collected_by_user_id)
    REFERENCES public.users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX lab_payments_tenant_id_id_key ON public.lab_payments(tenant_id, id);
CREATE UNIQUE INDEX lab_payments_tenant_id_idempotency_key_key
  ON public.lab_payments(tenant_id, idempotency_key);
CREATE INDEX lab_payments_tenant_id_visit_id_created_at_idx
  ON public.lab_payments(tenant_id, visit_id, created_at);

ALTER TABLE public.lab_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_lab_payments ON public.lab_payments
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE TRIGGER lab_payments_append_only
  BEFORE UPDATE OR DELETE ON public.lab_payments
  FOR EACH ROW EXECUTE FUNCTION public.phms_append_only_finance();

GRANT SELECT, INSERT ON public.lab_payments TO phms_app;
