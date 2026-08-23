-- Structured assessment declarations and explicit doctor-review disposition.
CREATE TYPE "MedicationStatus" AS ENUM ('NONE', 'TAKING_MEDICATION', 'UNKNOWN');
CREATE TYPE "ClinicalDisposition" AS ENUM (
  'DISCHARGED', 'FOLLOW_UP', 'REFERRED', 'ADMITTED', 'OBSERVATION',
  'EMERGENCY_TRANSFER', 'OTHER'
);
CREATE TYPE "DiagnosticOutcome" AS ENUM (
  'FINAL_DIAGNOSIS', 'NO_DEFINITIVE_DIAGNOSIS', 'OBSERVATION', 'REFERRAL'
);

ALTER TABLE public.clinical_assessments
  ADD COLUMN medication_status "MedicationStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN allergy_status "AllergyStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN no_significant_medical_history boolean NOT NULL DEFAULT false,
  ADD COLUMN no_past_surgery boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT clinical_assessment_medication_check CHECK (
    medication_status <> 'TAKING_MEDICATION' OR length(btrim(current_medicines)) > 0
  ),
  ADD CONSTRAINT clinical_assessment_allergy_check CHECK (
    allergy_status <> 'HAS_ALLERGIES' OR length(btrim(allergies)) > 0
  );

ALTER TABLE public.clinic_visits
  ADD COLUMN disposition "ClinicalDisposition",
  ADD COLUMN diagnostic_outcome "DiagnosticOutcome",
  ADD COLUMN follow_up_date date,
  ADD COLUMN follow_up_instructions varchar(3000),
  ADD COLUMN referral_destination varchar(300),
  ADD COLUMN referral_reason varchar(3000),
  ADD COLUMN transfer_reason varchar(3000),
  ADD COLUMN disposition_notes varchar(3000),
  ADD CONSTRAINT clinic_visit_disposition_details_check CHECK (
    (disposition <> 'FOLLOW_UP' OR follow_up_date IS NOT NULL)
    AND (disposition <> 'REFERRED' OR (
      length(btrim(referral_destination)) > 0 AND length(btrim(referral_reason)) > 0
    ))
    AND (disposition <> 'EMERGENCY_TRANSFER' OR length(btrim(transfer_reason)) > 0)
  );