# M6 legacy administration characterization

The legacy PHMS has only pharmacy-local `admin` and `staff` roles. It has no
platform owner, tenant onboarding, subscription plans, tenant suspension,
branding configuration, or controlled support access.

Legacy administrator behavior that remains tenant-scoped:

- manage pharmacy staff
- manage products and inventory
- read dashboards and reports
- manage debts and expenses

Behavior introduced only at the platform layer:

- create and lifecycle-manage tenants
- assign plans and enforce limits
- configure tenant branding defaults
- suspend or cancel a tenant without deleting data
- inspect platform audit evidence
- approve and revoke support sessions

The legacy administrator role must not be promoted into a platform role during
migration. The imported pharmacy administrator becomes the legacy tenant's
`OWNER`; platform users are provisioned separately.
