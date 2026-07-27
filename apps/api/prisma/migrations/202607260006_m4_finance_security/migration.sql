-- M4 finance tenant isolation, referential integrity, and append-only evidence.

ALTER TABLE public.invoice_sequences
  ADD CONSTRAINT invoice_sequences_branch_fkey
  FOREIGN KEY (tenant_id, branch_id)
  REFERENCES public.branches (tenant_id, id)
  ON DELETE RESTRICT;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_branch_fkey
  FOREIGN KEY (tenant_id, branch_id)
  REFERENCES public.branches (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT sales_sold_by_membership_fkey
  FOREIGN KEY (tenant_id, sold_by_membership_id)
  REFERENCES public.tenant_memberships (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT sales_sold_by_user_fkey
  FOREIGN KEY (sold_by_user_id)
  REFERENCES public.users (id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT sales_voided_by_membership_fkey
  FOREIGN KEY (tenant_id, voided_by_membership_id)
  REFERENCES public.tenant_memberships (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT sales_money_check
  CHECK (
    subtotal >= 0 AND discount >= 0 AND tax_total >= 0
    AND grand_total >= 0 AND amount_paid >= 0
    AND remaining_balance >= 0 AND returned_total >= 0
    AND discount <= subtotal + tax_total
    AND amount_paid <= grand_total
    AND remaining_balance <= grand_total
    AND returned_total <= grand_total
  ),
  ADD CONSTRAINT sales_void_state_check
  CHECK (
    (status <> 'VOIDED' AND voided_at IS NULL AND voided_by_membership_id IS NULL AND void_reason IS NULL)
    OR
    (status = 'VOIDED' AND voided_at IS NOT NULL AND voided_by_membership_id IS NOT NULL AND length(btrim(void_reason)) >= 3)
  );

ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_product_fkey
  FOREIGN KEY (tenant_id, product_id)
  REFERENCES public.products (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT sale_items_package_fkey
  FOREIGN KEY (tenant_id, product_package_id)
  REFERENCES public.product_packages (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT sale_items_quantity_check
  CHECK (
    units_per_package > 0
    AND package_quantity > 0
    AND base_units_sold > 0
    AND base_units_returned >= 0
    AND base_units_returned <= base_units_sold
  ),
  ADD CONSTRAINT sale_items_money_check
  CHECK (
    unit_price >= 0 AND unit_cost >= 0 AND subtotal >= 0
    AND discount_amount >= 0 AND tax_amount >= 0 AND line_total >= 0
  );

ALTER TABLE public.sale_item_allocations
  ADD CONSTRAINT sale_item_allocations_batch_fkey
  FOREIGN KEY (tenant_id, batch_id)
  REFERENCES public.inventory_batches (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT sale_item_allocations_quantity_check
  CHECK (quantity_base_units > 0 AND unit_cost >= 0);

ALTER TABLE public.payments
  ADD CONSTRAINT payments_branch_fkey
  FOREIGN KEY (tenant_id, branch_id)
  REFERENCES public.branches (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT payments_collector_fkey
  FOREIGN KEY (tenant_id, collected_by_membership_id)
  REFERENCES public.tenant_memberships (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT payments_collector_user_fkey
  FOREIGN KEY (collected_by_user_id)
  REFERENCES public.users (id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT payments_related_payment_fkey
  FOREIGN KEY (tenant_id, related_payment_id)
  REFERENCES public.payments (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT payments_amount_check
  CHECK (amount > 0),
  ADD CONSTRAINT payments_relation_check
  CHECK (
    (type = 'PAYMENT' AND related_payment_id IS NULL)
    OR
    (type IN ('REFUND', 'REVERSAL') AND related_payment_id IS NOT NULL)
  );

ALTER TABLE public.debts
  ADD CONSTRAINT debts_branch_fkey
  FOREIGN KEY (tenant_id, branch_id)
  REFERENCES public.branches (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT debts_money_check
  CHECK (
    total_amount >= 0 AND paid_amount >= 0 AND remaining_amount >= 0
    AND paid_amount <= total_amount AND remaining_amount <= total_amount
  );

ALTER TABLE public.sale_returns
  ADD CONSTRAINT sale_returns_branch_fkey
  FOREIGN KEY (tenant_id, branch_id)
  REFERENCES public.branches (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT sale_returns_processor_fkey
  FOREIGN KEY (tenant_id, processed_by_membership_id)
  REFERENCES public.tenant_memberships (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT sale_returns_processor_user_fkey
  FOREIGN KEY (processed_by_user_id)
  REFERENCES public.users (id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT sale_returns_refund_check
  CHECK (refund_amount >= 0 AND length(btrim(reason)) >= 3);

ALTER TABLE public.sale_return_items
  ADD CONSTRAINT sale_return_items_value_check
  CHECK (quantity_base_units > 0 AND refund_amount >= 0);

ALTER TABLE public.expense_categories
  ADD CONSTRAINT expense_categories_tenant_fkey
  FOREIGN KEY (tenant_id)
  REFERENCES public.tenants (id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT expense_categories_name_check
  CHECK (length(btrim(name)) >= 2);

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_branch_fkey
  FOREIGN KEY (tenant_id, branch_id)
  REFERENCES public.branches (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT expenses_creator_fkey
  FOREIGN KEY (tenant_id, created_by_membership_id)
  REFERENCES public.tenant_memberships (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT expenses_creator_user_fkey
  FOREIGN KEY (created_by_user_id)
  REFERENCES public.users (id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT expenses_voider_fkey
  FOREIGN KEY (tenant_id, voided_by_membership_id)
  REFERENCES public.tenant_memberships (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT expenses_amount_check
  CHECK (amount > 0),
  ADD CONSTRAINT expenses_void_state_check
  CHECK (
    (status = 'POSTED' AND voided_at IS NULL AND voided_by_membership_id IS NULL AND void_reason IS NULL)
    OR
    (status = 'VOIDED' AND voided_at IS NOT NULL AND voided_by_membership_id IS NOT NULL AND length(btrim(void_reason)) >= 3)
  );

CREATE OR REPLACE FUNCTION public.phms_require_finance_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.finance_write', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'finance projections may only be changed by a trusted workflow'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.phms_append_only_finance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER sales_guard_update
BEFORE UPDATE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.phms_require_finance_write();

CREATE TRIGGER sale_items_guard_update
BEFORE UPDATE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.phms_require_finance_write();

CREATE TRIGGER debts_guard_update
BEFORE UPDATE ON public.debts
FOR EACH ROW EXECUTE FUNCTION public.phms_require_finance_write();

CREATE TRIGGER expenses_guard_update
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.phms_require_finance_write();

CREATE TRIGGER invoice_sequences_guard_update
BEFORE UPDATE ON public.invoice_sequences
FOR EACH ROW EXECUTE FUNCTION public.phms_require_finance_write();

CREATE TRIGGER sale_items_no_delete
BEFORE DELETE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.phms_append_only_finance();

CREATE TRIGGER sale_item_allocations_append_only
BEFORE UPDATE OR DELETE ON public.sale_item_allocations
FOR EACH ROW EXECUTE FUNCTION public.phms_append_only_finance();

CREATE TRIGGER payments_append_only
BEFORE UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.phms_append_only_finance();

CREATE TRIGGER sale_returns_append_only
BEFORE UPDATE OR DELETE ON public.sale_returns
FOR EACH ROW EXECUTE FUNCTION public.phms_append_only_finance();

CREATE TRIGGER sale_return_items_append_only
BEFORE UPDATE OR DELETE ON public.sale_return_items
FOR EACH ROW EXECUTE FUNCTION public.phms_append_only_finance();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'invoice_sequences',
    'sales',
    'sale_items',
    'sale_item_allocations',
    'payments',
    'debts',
    'sale_returns',
    'sale_return_items',
    'expense_categories',
    'expenses'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I USING (tenant_id = app_private.current_tenant_id()) WITH CHECK (tenant_id = app_private.current_tenant_id())',
      table_name
    );
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'phms_app') THEN
    GRANT SELECT, INSERT, UPDATE ON
      public.invoice_sequences,
      public.sales,
      public.sale_items,
      public.debts,
      public.expense_categories,
      public.expenses
    TO phms_app;

    GRANT SELECT, INSERT ON
      public.sale_item_allocations,
      public.payments,
      public.sale_returns,
      public.sale_return_items
    TO phms_app;
  END IF;
END;
$$;
