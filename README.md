# HandyConnect

HandyConnect is a WhatsApp-first marketplace that connects customers with trusted local handymen.

## Product principles

1. Conversation first: no app download is required for the primary customer or handyman journey.
2. Fast matching: skill + service area + availability/access determine who sees a job.
3. Trust is the product: verification, completed-job history and ratings are first-class data.
4. Handymen pay for access to opportunity, not commission on work completed.
5. Payments and entitlements are separate: a successful payment creates an entitlement; payment state never directly grants access.
6. Few moving parts: Supabase is the system of record and serverless backend; WhatsApp and a payment provider are adapters around it.
7. Idempotency everywhere: duplicate messages, payment events and onboarding requests must be safe to replay.

## Current architecture

- Supabase Postgres: system of record
- Supabase Edge Functions: conversation and integration layer
- WhatsApp Cloud API: primary interface adapter
- PSP: planned subscription / lead-credit collection
- GitHub: source of truth for migrations and functions

## Implemented

- marketplace schema for customers, handymen, skills, service areas, jobs, matching, assignments and reviews
- plans, subscriptions, entitlements, payments and immutable provider payment events
- atomic handyman onboarding with a monthly Free limit of 3 job opportunities
- conversation session/message persistence and duplicate inbound-message protection
- candidate ranking by skill + city + suburb + Pro/free access
- atomic first-accept-wins job assignment
- deployed `conversation-engine` Edge Function for handyman onboarding and customer job intake
- deployed `whatsapp-webhook` adapter with Meta challenge verification, `X-Hub-Signature-256` validation and outbound text support

## WhatsApp configuration still required

Set these Supabase Edge Function secrets before connecting Meta:

- `META_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_VERSION`

Do not commit any of those values to Git.

See `docs/architecture.md` and `docs/conversations.md`.
