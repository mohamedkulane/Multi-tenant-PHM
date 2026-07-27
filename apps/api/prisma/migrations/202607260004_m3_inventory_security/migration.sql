-- M3 inventory isolation, invariants and immutable ledger protection.

ALTER TABLE public.products
  ADD CONSTRAINT products_tenant_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ADD CONSTRAINT products_name_normalized
  CHECK (normalized_name = lower(normalized_name)),
  ADD CONSTRAINT products_version_positive CHECK (version > 0);

ALTER TABLE public.product_packages
  ADD CONSTRAINT product_packages_units_positive CHECK (units_per_package > 0),
  ADD CONSTRAINT product_packages_price_nonnegative
  CHECK (sale_price IS NULL OR sale_price >= 0),
  ADD CONSTRAINT product_packages_sort_nonnegative CHECK (sort_order >= 0);

ALTER TABLE public.branch_products
  ADD CONSTRAINT branch_products_branch_fkey
  FOREIGN KEY (tenant_id, branch_id)
  REFERENCES public.branches(tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT branch_products_reorder_nonnegative
  CHECK (reorder_point_base_units >= 0);

ALTER TABLE public.inventory_batches
  ADD CONSTRAINT inventory_batches_branch_fkey
  FOREIGN KEY (tenant_id, branch_id)
  REFERENCES public.branches(tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT inventory_batches_quantity_nonnegative
  CHECK (quantity_on_hand >= 0),
  ADD CONSTRAINT inventory_batches_unit_cost_nonnegative
  CHECK (unit_cost IS NULL OR unit_cost >= 0);

ALTER TABLE public.inventory_receipts
  ADD CONSTRAINT inventory_receipts_branch_fkey
  FOREIGN KEY (tenant_id, branch_id)
  REFERENCES public.branches(tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT inventory_receipts_actor_fkey
  FOREIGN KEY (tenant_id, actor_membership_id)
  REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_receipt_items
  ADD CONSTRAINT inventory_receipt_items_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT inventory_receipt_items_cost_nonnegative CHECK (unit_cost >= 0);

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_branch_fkey
  FOREIGN KEY (tenant_id, branch_id)
  REFERENCES public.branches(tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT stock_movements_actor_fkey
  FOREIGN KEY (tenant_id, actor_membership_id)
  REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT stock_movements_delta_nonzero CHECK (quantity_delta <> 0),
  ADD CONSTRAINT stock_movements_balance_nonnegative CHECK (balance_after >= 0),
  ADD CONSTRAINT stock_movements_direction_check CHECK (
    (type IN ('RECEIPT', 'ADJUSTMENT_IN', 'RETURN', 'TRANSFER_IN') AND quantity_delta > 0)
    OR
    (type IN ('ADJUSTMENT_OUT', 'SALE', 'TRANSFER_OUT', 'EXPIRED') AND quantity_delta < 0)
    OR type = 'VOID'
  );

ALTER TABLE public.inventory_transfers
  ADD CONSTRAINT inventory_transfers_source_branch_fkey
  FOREIGN KEY (tenant_id, source_branch_id)
  REFERENCES public.branches(tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT inventory_transfers_destination_branch_fkey
  FOREIGN KEY (tenant_id, destination_branch_id)
  REFERENCES public.branches(tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT inventory_transfers_actor_fkey
  FOREIGN KEY (tenant_id, initiated_by_membership_id)
  REFERENCES public.tenant_memberships(tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT inventory_transfers_distinct_branches
  CHECK (source_branch_id <> destination_branch_id),
  ADD CONSTRAINT inventory_transfers_completion_state CHECK (
    (status = 'COMPLETED' AND completed_at IS NOT NULL)
    OR (status <> 'COMPLETED' AND completed_at IS NULL)
  );

ALTER TABLE public.inventory_transfer_items
  ADD CONSTRAINT inventory_transfer_items_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT inventory_transfer_items_distinct_batches
  CHECK (source_batch_id <> destination_batch_id);

CREATE OR REPLACE FUNCTION app_private.validate_receipt_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  receipt_branch uuid;
  batch_branch uuid;
  batch_product uuid;
BEGIN
  SELECT branch_id INTO STRICT receipt_branch
  FROM public.inventory_receipts
  WHERE tenant_id = NEW.tenant_id AND id = NEW.receipt_id;

  SELECT branch_id, product_id INTO STRICT batch_branch, batch_product
  FROM public.inventory_batches
  WHERE tenant_id = NEW.tenant_id AND id = NEW.batch_id;

  IF receipt_branch <> batch_branch OR NEW.product_id <> batch_product THEN
    RAISE EXCEPTION 'receipt item branch/product does not match its batch'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER inventory_receipt_items_validate
BEFORE INSERT OR UPDATE ON public.inventory_receipt_items
FOR EACH ROW EXECUTE FUNCTION app_private.validate_receipt_item();

CREATE OR REPLACE FUNCTION app_private.validate_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_branch uuid;
  batch_product uuid;
BEGIN
  SELECT branch_id, product_id INTO STRICT batch_branch, batch_product
  FROM public.inventory_batches
  WHERE tenant_id = NEW.tenant_id AND id = NEW.batch_id;

  IF NEW.branch_id <> batch_branch OR NEW.product_id <> batch_product THEN
    RAISE EXCEPTION 'stock movement branch/product does not match its batch'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER stock_movements_validate
BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION app_private.validate_stock_movement();

CREATE OR REPLACE FUNCTION app_private.validate_transfer_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_branch uuid;
  destination_branch uuid;
  source_batch_branch uuid;
  destination_batch_branch uuid;
  source_product uuid;
  destination_product uuid;
BEGIN
  SELECT source_branch_id, destination_branch_id
  INTO STRICT source_branch, destination_branch
  FROM public.inventory_transfers
  WHERE tenant_id = NEW.tenant_id AND id = NEW.transfer_id;

  SELECT branch_id, product_id
  INTO STRICT source_batch_branch, source_product
  FROM public.inventory_batches
  WHERE tenant_id = NEW.tenant_id AND id = NEW.source_batch_id;

  SELECT branch_id, product_id
  INTO STRICT destination_batch_branch, destination_product
  FROM public.inventory_batches
  WHERE tenant_id = NEW.tenant_id AND id = NEW.destination_batch_id;

  IF source_batch_branch <> source_branch
    OR destination_batch_branch <> destination_branch
    OR source_product <> NEW.product_id
    OR destination_product <> NEW.product_id THEN
    RAISE EXCEPTION 'transfer item branches/product do not match its batches'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER inventory_transfer_items_validate
BEFORE INSERT OR UPDATE ON public.inventory_transfer_items
FOR EACH ROW EXECUTE FUNCTION app_private.validate_transfer_item();

CREATE OR REPLACE FUNCTION app_private.reject_stock_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements are append-only'
    USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER stock_movements_append_only
BEFORE UPDATE OR DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION app_private.reject_stock_movement_mutation();

CREATE OR REPLACE FUNCTION app_private.guard_batch_balance_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.quantity_on_hand IS DISTINCT FROM OLD.quantity_on_hand
    AND current_setting('app.inventory_write', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'batch balances may change only through inventory workflows'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER inventory_batches_guard_balance
BEFORE UPDATE OF quantity_on_hand ON public.inventory_batches
FOR EACH ROW EXECUTE FUNCTION app_private.guard_batch_balance_mutation();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;
CREATE POLICY products_tenant_isolation ON public.products
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

ALTER TABLE public.product_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_packages FORCE ROW LEVEL SECURITY;
CREATE POLICY product_packages_tenant_isolation ON public.product_packages
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

ALTER TABLE public.branch_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_products FORCE ROW LEVEL SECURITY;
CREATE POLICY branch_products_tenant_isolation ON public.branch_products
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_batches_tenant_isolation ON public.inventory_batches
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

ALTER TABLE public.inventory_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_receipts_tenant_isolation ON public.inventory_receipts
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

ALTER TABLE public.inventory_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_receipt_items FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_receipt_items_tenant_isolation ON public.inventory_receipt_items
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_movements_tenant_isolation ON public.stock_movements
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (
    tenant_id = app_private.current_tenant_id()
    AND actor_membership_id = app_private.current_membership_id()
  );

ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfers FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_transfers_tenant_isolation ON public.inventory_transfers
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

ALTER TABLE public.inventory_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfer_items FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_transfer_items_tenant_isolation ON public.inventory_transfer_items
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'phms_app') THEN
    GRANT SELECT, INSERT, UPDATE ON
      public.products,
      public.product_packages,
      public.branch_products,
      public.inventory_batches,
      public.inventory_receipts,
      public.inventory_receipt_items,
      public.inventory_transfers,
      public.inventory_transfer_items
    TO phms_app;
    GRANT SELECT, INSERT ON public.stock_movements TO phms_app;
    GRANT USAGE, SELECT ON SEQUENCE public.stock_movements_id_seq TO phms_app;
  END IF;
END
$$;
