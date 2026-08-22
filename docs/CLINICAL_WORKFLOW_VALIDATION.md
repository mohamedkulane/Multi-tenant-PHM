# Clinical workflow validation

## Supported flow

1. Reception registers a patient and visit.
2. Reception collects the consultation fee.
3. Doctor manually records symptoms, history, medicines/allergies, vitals, physical examination, and provisional/differential diagnosis.
4. Doctor may submit one or more explicitly selected active laboratory tests. When tests are requested, an empty selection is rejected.
5. Reception collects the laboratory balance before laboratory work.
6. Laboratory records sample details and each test result/interpretation.
7. Doctor reviews all returned results, records a final diagnosis, and completes the review.
8. Medication is written on physical hospital paper outside PHMS.
9. Pharmacy independently sells medicine through FEFO POS and may optionally link the completed clinic visit.

## Role boundaries

| Role           | Landing route          | Visible work                                               |
| -------------- | ---------------------- | ---------------------------------------------------------- |
| Owner / Admin  | `/dashboard`           | Organization administration and reports                    |
| Receptionist   | `/reception/dashboard` | Patient registration, consultation/lab payments, hand-offs |
| Doctor         | `/doctor/dashboard`    | Patient queue and clinical record only                     |
| Lab technician | `/lab/dashboard`       | Laboratory queue, samples, and results                     |
| Pharmacist     | `/pharmacy/dashboard`  | POS, products, inventory, suppliers, customers             |

Frontend route guards and backend permissions both enforce these boundaries. Doctors and pharmacists cannot open sales/expense/reporting screens outside their role.

## Automated verification targets

- API typecheck and route tests, including review completion with and without laboratory work.
- Web typecheck, category-grouped laboratory selection test, role landing/route isolation tests.
- Full lint, build, migration validation, and repository-wide active-code search for the removed domain.
