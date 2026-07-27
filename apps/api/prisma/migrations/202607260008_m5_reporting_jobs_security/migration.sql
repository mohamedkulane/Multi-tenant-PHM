-- M5 report performance, durable job security, notification isolation, and immutable artifacts.

CREATE INDEX sales_reporting_idx
  ON public.sales (tenant_id, branch_id, business_date, status);
CREATE INDEX payments_reporting_idx
  ON public.payments (tenant_id, branch_id, created_at, type);
CREATE INDEX batches_reporting_idx
  ON public.inventory_batches (tenant_id, branch_id, expiry_date)
  WHERE quantity_on_hand > 0;
CREATE INDEX expenses_reporting_idx
  ON public.expenses (tenant_id, branch_id, expense_date, status);
CREATE INDEX debts_reporting_idx
  ON public.debts (tenant_id, branch_id, due_date)
  WHERE remaining_amount > 0;

ALTER TABLE public.async_jobs
  ADD CONSTRAINT async_jobs_branch_fkey
  FOREIGN KEY (tenant_id, branch_id)
  REFERENCES public.branches (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT async_jobs_requester_fkey
  FOREIGN KEY (tenant_id, requested_by_membership_id)
  REFERENCES public.tenant_memberships (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT async_jobs_requester_user_fkey
  FOREIGN KEY (requested_by_user_id)
  REFERENCES public.users (id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT async_jobs_attempts_check
  CHECK (
    attempts >= 0 AND max_attempts BETWEEN 1 AND 20
    AND attempts <= max_attempts
  ),
  ADD CONSTRAINT async_jobs_lock_state_check
  CHECK (
    (status <> 'RUNNING' AND locked_at IS NULL AND locked_by IS NULL)
    OR
    (status = 'RUNNING' AND locked_at IS NOT NULL AND length(btrim(locked_by)) > 0)
  );

ALTER TABLE public.report_exports
  ADD CONSTRAINT report_exports_job_fkey
  FOREIGN KEY (tenant_id, job_id)
  REFERENCES public.async_jobs (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT report_exports_branch_fkey
  FOREIGN KEY (tenant_id, branch_id)
  REFERENCES public.branches (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT report_exports_content_check
  CHECK (octet_length(content) > 0 AND expires_at > created_at);

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_branch_fkey
  FOREIGN KEY (tenant_id, branch_id)
  REFERENCES public.branches (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT notifications_reader_fkey
  FOREIGN KEY (tenant_id, read_by_membership_id)
  REFERENCES public.tenant_memberships (tenant_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT notifications_read_state_check
  CHECK (
    (read_at IS NULL AND read_by_membership_id IS NULL)
    OR
    (read_at IS NOT NULL AND read_by_membership_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.phms_require_job_worker()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.job_worker', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'job state may only be changed by a trusted worker'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.phms_require_notification_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.notification_write', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'notification state may only be changed by a trusted workflow'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER async_jobs_guard_update
BEFORE UPDATE ON public.async_jobs
FOR EACH ROW EXECUTE FUNCTION public.phms_require_job_worker();

CREATE TRIGGER report_exports_append_only
BEFORE UPDATE OR DELETE ON public.report_exports
FOR EACH ROW EXECUTE FUNCTION public.phms_append_only_finance();

CREATE TRIGGER notifications_guard_update
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.phms_require_notification_write();

CREATE TRIGGER notifications_no_delete
BEFORE DELETE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.phms_append_only_finance();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'async_jobs',
    'report_exports',
    'notifications'
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
    GRANT SELECT, INSERT, UPDATE ON public.async_jobs TO phms_app;
    GRANT SELECT, INSERT ON public.report_exports TO phms_app;
    GRANT SELECT, INSERT, UPDATE ON public.notifications TO phms_app;
  END IF;
END;
$$;
