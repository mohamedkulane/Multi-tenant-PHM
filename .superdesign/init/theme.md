# Theme

## Compact token summary

- Font: Inter, ui-sans-serif, system UI
- Tenant primary: `#0d2926` (runtime override via `--tenant-primary`)
- Tenant accent: `#b8f39a` (runtime override via `--tenant-accent`)
- Canvas: `#f4f7f6`; cards: white; text: slate-950; muted: slate-500/600
- Success/accent: emerald; warning: amber; danger: rose
- Controls: 0.75rem radius; cards/dialogs: 1rem radius; sidebar width: 18rem
- Card shadow: `0 10px 35px rgba(15,23,42,.05)`; dialogs use large shadow
- Main page max width: 1600px; responsive breakpoints follow Tailwind defaults
- Motion: 150ms control transitions; sidebar transform; subtle hover elevations
- Print: A4/browser-print visibility isolated with `.invoice-print-sheet`

## Full global stylesheet

```css
@import "tailwindcss";

:root {
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  color: #0f172a;
  background: #edf3f1;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  --tenant-primary: #0d2926;
  --tenant-accent: #b8f39a;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button,
input,
select,
textarea {
  font: inherit;
}

::selection {
  color: #ffffff;
  background: var(--tenant-primary);
}

button,
a {
  -webkit-tap-highlight-color: transparent;
}
button {
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.input {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 0.75rem;
  background: #fff;
  padding: 0.625rem 0.75rem;
  color: #0f172a;
  outline: none;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}
.input:focus {
  border-color: var(--tenant-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tenant-primary) 18%, transparent);
}
.btn-primary,
.btn-secondary {
  display: inline-flex;
  min-height: 2.5rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 0.75rem;
  padding: 0.625rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 700;
  transition: 150ms ease;
}
.btn-primary {
  border: 1px solid var(--tenant-primary);
  background: var(--tenant-primary);
  color: #fff;
}
.btn-primary:hover {
  background: color-mix(in srgb, var(--tenant-primary) 82%, white);
}
.btn-secondary {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
}
.btn-secondary:hover {
  background: #f8fafc;
}

.btn-danger,
.btn-icon {
  display: inline-flex;
  min-height: 2.5rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 0.75rem;
  font-size: 0.875rem;
  font-weight: 700;
  transition: 150ms ease;
}
.btn-danger {
  border: 1px solid #fecaca;
  background: #fff1f2;
  padding: 0.625rem 0.875rem;
  color: #be123c;
}
.btn-danger:hover {
  background: #ffe4e6;
}
.btn-icon {
  width: 2.5rem;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
}
.btn-icon:hover {
  background: #f8fafc;
}
.action-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 0.875rem 1rem;
}

.pagination-button {
  min-width: 2.85rem;
  border: 1px solid #d7dee8;
  border-right-width: 0;
  background: #fff;
  padding: 0.65rem 0.85rem;
  color: #475569;
  font-size: 0.875rem;
  transition: 150ms ease;
}
.pagination-button:last-child {
  border-right-width: 1px;
}
.pagination-button:hover:not(:disabled):not(.is-active) {
  background: #f8fafc;
  color: var(--tenant-primary);
}
.pagination-button.is-active {
  border-color: var(--tenant-primary);
  background: var(--tenant-primary);
  color: #fff;
}
.pagination-button:disabled {
  background: #f8fafc;
  color: #94a3b8;
}

@media print {
  @page {
    margin: 12mm;
  }
  body * {
    visibility: hidden !important;
  }
  .invoice-print-sheet,
  .invoice-print-sheet * {
    visibility: visible !important;
  }
  .invoice-print-sheet {
    position: absolute !important;
    inset: 0 auto auto 0 !important;
    width: 100% !important;
    margin: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    color: #0f172a !important;
    background: white !important;
  }
}
```
