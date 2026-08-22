# Lab Technician Dashboard — Design QA

- Source visual truth: `C:\Users\maxam\.codex\attachments\d4638215-5b37-4f83-ac45-a191b5522fda\image-2.png`
- Implementation desktop capture: `docs/design-qa/lab-dashboard/desktop-final.png`
- Implementation mobile capture: `docs/design-qa/lab-dashboard/mobile-final.png`
- Full comparison: `docs/design-qa/lab-dashboard/desktop-comparison.png`
- Focused queue comparison: `docs/design-qa/lab-dashboard/queue-comparison.png`
- State: Lab Technician dashboard with five unique patients and one deliberately duplicated historical order in the fixture.

## Viewport and normalization

- Source: 1536 × 1024 px desktop image.
- Desktop browser CSS viewport: 1536 × 1024 at device pixel ratio 1. The in-app capture surface produced 1521 × 868 px.
- Full comparison: source top 1536 × 868 region normalized to 1521 × 868 and placed beside the 1521 × 868 implementation capture.
- Mobile browser CSS viewport: 390 × 844 at device pixel ratio 1. The in-app capture surface produced 375 × 812 px.

## Full-view comparison evidence

- The final implementation matches the reference's compact navy sidebar, white top bar, centered search, five-card KPI row, two-column queue/sidebar layout, white cards, restrained shadows, blue primary actions, and semantic laboratory status colors.
- The implementation intentionally omits Pharmacy inventory and broad Reports links for the Lab Technician role because those modules expose unrelated commercial data. It retains only laboratory job pages and Account.
- Live counts, the staff member's real name, and workflow workload replace the reference's illustrative static values and schedule.

## Focused queue comparison evidence

- The queue comparison confirms matching header hierarchy, tabs, column structure, dense rows, patient secondary details, priority/status chips, waiting time emphasis, and primary/secondary actions.
- Six fixture orders containing two orders for the same patient render as five queue rows. The newest order is retained; full history remains available in Laboratory Orders.
- The Completed filter renders one completed row whose only action is **View**.

## Required fidelity surfaces

- Fonts and typography: existing Inter/system UI stack preserved; weights, hierarchy, capitalization, and compact secondary text align with the source.
- Spacing and layout rhythm: sidebar reduced to 248 px, desktop content proportions and five-card KPI grid align with the source; mobile uses a clean two-column KPI grid and horizontally scrollable queue.
- Colors and visual tokens: tenant navy remains authoritative; routine/sample states are blue, payment is amber, result entry violet, urgent rose, and completed emerald.
- Image quality and assets: the production shell continues to use each tenant's real logo. The QA fixture's icon fallback is not shipped as a replacement asset.
- Copy and content: wording is operational and data-backed. Lab-specific navigation and search match the reference's intent without exposing unrelated sales or finance pages.

## Comparison history

1. Initial finding (P1): historical orders repeated the same patient throughout the dashboard queue. Fix: newest-order-per-patient projection added only to dashboard queue/recent-completed surfaces. Evidence: final fixture has six orders and five rendered patient rows.
2. Initial finding (P1): completed orders with an uncollected sample flag could show **Collect sample**. Fix: completed state now takes precedence and always renders **View**. Evidence: Completed-filter interaction shows one row with `COMPLETED` and `View`.
3. Initial finding (P2): sidebar was wider than the source and lacked job-stage navigation and global search. Fix: 248 px sidebar, Sample collection, Results entry, Completed results, separated Account, and functional laboratory search were added.
4. Initial finding (P2): mobile KPI cards formed an unnecessarily long single column. Fix: two-column mobile KPI grid with clear wrapping and no horizontal page overflow.

## Interaction and runtime checks

- All queue tab: 5 unique rows.
- Completed queue tab: 1 row, action `View`.
- Mobile navigation opens and exposes all Lab Technician routes plus Account.
- Search field is visible at desktop width and routes queries to Laboratory Orders.
- Browser console errors/warnings: none.

## Remaining differences

- P3: the reference includes static day scheduling, inventory, and broad reports. The implementation uses real workflow workload and role-safe navigation instead.
- P3: dynamic tenant branding and staff identity naturally differ from the illustrative mock.

final result: passed
