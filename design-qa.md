# Sales POS Design QA

- Source visual truth: `C:\Users\maxam\Downloads\WhatsApp Image 2026-07-28 at 7.51.03 PM.jpeg`
- Implementation: tenant Sales route in the local PHMS web application
- Source dimensions: 1600 x 720 pixels
- Intended comparison viewport: 1600 x 720 CSS pixels at device scale factor 1
- State: authenticated pharmacy tenant, Sales page, product browser and empty cart
- Implementation screenshot: unavailable

## Full-view comparison evidence

The supplied source image was available in the conversation and used as the
layout reference. A browser-rendered implementation screenshot could not be
captured because the Codex in-app browser runtime failed to start in the
Windows sandbox. Therefore, a normalized side-by-side visual comparison was
not possible.

## Focused region comparison evidence

Blocked for the same reason. The product browser, view toggle, pagination,
selection preview, and shopping cart could not be captured as rendered browser
regions.

## Findings

- [P1] Browser visual verification is unavailable.
  - Location: complete Sales POS page.
  - Evidence: the reference image is available, but there is no browser-rendered
    implementation screenshot.
  - Impact: typography, exact spacing, responsive wrapping, and visual fidelity
    cannot be signed off from source code or automated DOM tests alone.
  - Fix: restore the in-app browser connection, capture the Sales page at
    1600 x 720, combine it with the source image, and run the visual comparison.

## Required fidelity surfaces

- Fonts and typography: implemented with the application's existing Inter-based
  type system; browser comparison blocked.
- Spacing and layout rhythm: the source's customer header, two-column product
  browser/cart layout, and compact controls were implemented; pixel comparison
  blocked.
- Colors and visual tokens: existing tenant emerald/slate tokens were preserved;
  browser comparison blocked.
- Image quality and asset fidelity: the source contains no required product
  imagery or decorative raster assets. Existing icon components are used.
- Copy and content: customer details, search, product selection, stock and price
  preview, cart totals, payment, and checkout content are implemented.

## Functional verification

- Product search control is rendered.
- Grid and list controls are rendered and stateful.
- Product pagination controls are rendered and stateful.
- Package-aware product selection is implemented.
- Multiple products can be added to one cart.
- Repeated product/package selections merge their quantities.
- The same product can be added using different packages.
- Subtotal, discount, grand total, balance, and change are calculated.
- Frontend automated tests: 9 passed.
- TypeScript check: passed.
- ESLint check: passed.
- Production build: passed.
- Browser primary interactions: not run.
- Browser console errors: not checked.

## Comparison history

- Iteration 1: implementation completed, but source-to-browser comparison was
  blocked before the first visual pass because the in-app browser runtime could
  not start.

## Implementation checklist

- Restore the in-app browser connection.
- Capture the authenticated Sales page at 1600 x 720.
- Compare the full screen and focused product-browser/cart regions.
- Fix any P0, P1, or P2 differences and repeat the capture.

## Follow-up polish

- Consider a denser card option for pharmacies with very large catalogs after
  the first browser comparison.

final result: blocked
