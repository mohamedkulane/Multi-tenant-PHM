# Extractable Components

## TenantShell

- Source: `apps/web/src/components/shell.tsx`
- Category: layout
- Description: Tenant workspace shell with branded responsive sidebar, header, branch switcher, alerts, and sign out.
- Extractable props: currentPath, branch, unreadNotifications, displayName, userName, role, logoUrl
- Hardcoded: navigation labels, Lucide icons, layout classes

## Sidebar

- Source: `apps/web/src/components/shell.tsx`
- Category: layout
- Description: Dark branded navigation sidebar used across all tenant and platform pages.
- Extractable props: currentPath, platform, primaryColor, accentColor, logoUrl, open
- Hardcoded: PHMS wordmark, icons, navigation treatment

## PageHeader

- Source: `apps/web/src/components/ui.tsx`
- Category: basic
- Description: Page title, eyebrow, description, and actions.
- Extractable props: eyebrow, title, description, actions
- Hardcoded: typography and responsive layout

## Card

- Source: `apps/web/src/components/ui.tsx`
- Category: basic
- Description: Rounded white content container with optional heading and description.
- Extractable props: title, description, children
- Hardcoded: border, radius, shadow

## SimpleTable

- Source: `apps/web/src/components/ui.tsx`
- Category: basic
- Description: Responsive table with consistent headers, rows, and pagination.
- Extractable props: columns, rows, pageSize
- Hardcoded: visual classes and pagination treatment

## StatusBadge

- Source: `apps/web/src/components/ui.tsx`
- Category: basic
- Description: Semantic status pill for active/paid/pending/error states.
- Extractable props: value
- Hardcoded: semantic tone mapping
