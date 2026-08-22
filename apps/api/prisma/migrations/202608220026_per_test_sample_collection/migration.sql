-- Track every ordered test's specimen separately. Existing collected visits are
-- backfilled from their legacy visit-level sample so historical data is preserved.
ALTER TABLE public.lab_visit_tests
  ADD COLUMN IF NOT EXISTS sample_type varchar(80),
  ADD COLUMN IF NOT EXISTS sample_id varchar(80),
  ADD COLUMN IF NOT EXISTS sample_notes varchar(1000),
  ADD COLUMN IF NOT EXISTS sample_collected_at timestamptz(3),
  ADD COLUMN IF NOT EXISTS sample_collected_by_membership_id uuid;

UPDATE public.lab_visit_tests AS visit_test
SET sample_type = lab_test.sample_type
FROM public.lab_tests AS lab_test
WHERE visit_test.tenant_id = lab_test.tenant_id
  AND visit_test.lab_test_id = lab_test.id;

UPDATE public.lab_visit_tests AS visit_test
SET sample_id = lab_visit.sample_id,
    sample_notes = lab_visit.sample_notes,
    sample_collected_at = lab_visit.sample_collected_at,
    sample_collected_by_membership_id = lab_visit.sample_collected_by_membership_id
FROM public.lab_visits AS lab_visit
WHERE visit_test.tenant_id = lab_visit.tenant_id
  AND visit_test.visit_id = lab_visit.id
  AND lab_visit.sample_status = 'COLLECTED';
