# PHMS Clinical Data Rules

## Patient identity

Age is never stored as a permanently increasing integer. Store date of birth when known; otherwise store an explicitly estimated age value and unit. Sex and allergy status are structured values. Legacy blank sex is migrated to `UNKNOWN` rather than guessed.

## Doctor assessment and completion

Symptoms, history, medicines, allergies, vitals, examination, and provisional diagnosis are manually recorded by the clinician. Blood pressure is a pair. Explicit `unknown`, `none`, and “no significant history” states prevent blank fields from being misread as negative findings.

A visit completes only with a diagnostic outcome and disposition. Final diagnosis is required only when the outcome is `FINAL_DIAGNOSIS`. Follow-up needs a date and instructions; referral needs destination and reason; emergency transfer needs a reason.

## Laboratory

Every ordered test has its own sample record. The system generates a traceable sample/tube ID for acceptable samples. Hemolyzed, clotted, insufficient, contaminated, leaking, wrong-container, or other rejected samples are marked `RECOLLECTION_REQUIRED` and do not enter result entry.

Result validation follows the catalog result type. Positive/negative tests use qualitative states; numeric tests require a number; select tests use configured options; panels require all configured mandatory components. Completed results are immutable through normal entry and must use an audited amendment process.

## Role visibility

- Reception: identity, workflow hand-off, required payment/receipt status; no clinical result content.
- Doctor: clinical record and read-only laboratory results; no prices, balances, sales, expenses, or operational finance reports.
- Laboratory Technician: paid status only, patient specimen identity, ordered tests, sample and result work; no amounts.
- Pharmacist: prescription hand-off and pharmacy sale data; no unrelated clinical history.
- Owner/Admin: operational administration subject to tenant/branch scope; restricted clinical data should be accessed only for an authorized operational purpose and audited.
