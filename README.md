# HandyConnect

HandyConnect is a WhatsApp-first marketplace that connects customers with trusted local handymen.

## Product principles

1. Conversation first: no app download is required for the primary customer or handyman journey.
2. No dead ends: after every user action, HandyConnect either takes the next action itself or presents the next useful decision.
3. Fast matching: skill + service coverage + current availability + trust/access determine who sees a job.
4. A job stays active until it is matched, cancelled or completed; customers should not need to keep checking manually.
5. Trust is the product: verification, completed-job history, ratings and report history are first-class data.
6. Handymen pay for access to genuine opportunities, not commission on work completed.
7. Payments and entitlements are separate: a successful payment creates an entitlement; payment state never directly grants access.
8. Few moving parts: Supabase is the system of record and serverless backend; WhatsApp and a payment provider are adapters around it.
9. Idempotency everywhere: duplicate messages, payment events, notifications and onboarding requests must be safe to replay.

## Current architecture

- Supabase Postgres: system of record, matching state, entitlements, trust and notification outbox
- Supabase Edge Functions: marketplace router, customer job router, handyman router, conversation engine, WhatsApp adapter and marketplace dispatcher
- WhatsApp Cloud API: primary customer and handyman interface
- PSP: next external integration for Pro subscription collection
- GitHub: source of truth for migrations and Edge Functions

## Implemented

- customer, handyman, skill, service-area, job, matching, assignment and review schema
- 25 service categories with natural-language classification for common requests
- active customer job command centre with status, edit, cancel and new-request actions
- explicit handyman availability and expiry
- handyman dashboard with 2/4/8/12-hour availability choices
- multiple handyman skills and service areas with suburb/city/province coverage scopes
- candidate ranking by skill, coverage, availability, Pro/free access, verification, rating and completed-job history
- atomic first-accept-wins job assignment
- job start, completion and customer rating lifecycle
- staged matching attempts with offer expiry and escalation state
- durable notification outbox with retry and deduplication support
- job event audit trail
- user-report/trust foundation
- service-role-only admin marketplace-health and waiting-job views
- Free plan limit of 3 opportunities per month and Pro entitlement model
- conversation session/message persistence and duplicate inbound-message protection
- Meta webhook challenge verification and `X-Hub-Signature-256` validation
- interactive WhatsApp buttons/lists for menus, categories and actions

## Operational configuration

The WhatsApp adapter requires Supabase Edge Function secrets:

- `META_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_VERSION`

The JWT-protected `marketplace-dispatcher` is deployed. Production recurring invocation must use a securely configured scheduler credential; credentials must never be committed to Git.

## Next work

1. Activate secure scheduled dispatcher invocation.
2. Integrate the selected South African payment provider for Pro subscriptions.
3. Add customer/handyman reporting actions to the WhatsApp menus and verification operations.
4. Add a lightweight operational admin surface over the existing admin views.
5. Complete end-to-end pilot tests with separate customer and handyman numbers.

See `docs/architecture.md` and `docs/conversations.md`.
