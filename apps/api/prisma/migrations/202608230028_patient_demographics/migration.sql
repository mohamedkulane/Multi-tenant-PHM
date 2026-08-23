-- Replace independently editable age with DOB-or-estimated-age demographics.
CREATE TYPE "EstimatedAgeUnit" AS ENUM ('DAYS', 'MONTHS', 'YEARS');
CREATE TYPE "AllergyStatus" AS ENUM ('NO_KNOWN_ALLERGIES', 'HAS_ALLERGIES', 'UNKNOWN');

ALTER TABLE public.patients
  ADD COLUMN estimated_age_value integer,
  ADD COLUMN estimated_age_unit "EstimatedAgeUnit",
  ADD COLUMN allergy_status "AllergyStatus" NOT NULL DEFAULT 'UNKNOWN';

UPDATE public.patients
SET estimated_age_value = age,
    estimated_age_unit = 'YEARS'
WHERE date_of_birth IS NULL;

UPDATE public.patients
SET sex = 'UNKNOWN'
WHERE sex IS NULL OR btrim(sex) = '';

UPDATE public.patients
SET allergy_status = CASE
  WHEN allergies IS NULL OR btrim(allergies) = '' THEN 'UNKNOWN'::"AllergyStatus"
  ELSE 'HAS_ALLERGIES'::"AllergyStatus"
END;

ALTER TABLE public.patients
  ALTER COLUMN sex SET NOT NULL,
  DROP CONSTRAINT IF EXISTS patients_value_check,
  DROP COLUMN age,
  ADD CONSTRAINT patients_demographics_check CHECK (
    (date_of_birth IS NOT NULL AND estimated_age_value IS NULL AND estimated_age_unit IS NULL)
    OR
    (date_of_birth IS NULL AND estimated_age_value BETWEEN 0 AND 130 AND estimated_age_unit IS NOT NULL)
  ),
  ADD CONSTRAINT patients_allergy_details_check CHECK (
    allergy_status <> 'HAS_ALLERGIES' OR length(btrim(allergies)) > 0
  );

CREATE INDEX patients_tenant_id_phone_idx ON public.patients(tenant_id, phone);