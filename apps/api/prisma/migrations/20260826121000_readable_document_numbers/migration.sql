CREATE TABLE public.tenant_document_counters (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind varchar(40) NOT NULL,
  current_value bigint NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, kind)
);

ALTER TABLE public.tenant_document_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_document_counters_tenant_isolation
  ON public.tenant_document_counters
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON public.tenant_document_counters TO phms_app;