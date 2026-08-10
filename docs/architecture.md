# HandyConnect Architecture

## First-principles boundary

The core business transaction is: a customer has a problem; a qualified handyman has capacity; HandyConnect creates a fast trusted connection and charges handymen for access to opportunities.

The platform therefore owns four things: identity/reputation, job demand, matching/assignment, and access entitlements. It does not need to own customer-to-handyman settlement in the MVP.

## System of record

Supabase Postgres is authoritative. There is intentionally no Prisma/Railway database layer. The 2025 NestJS/Prisma/React Native implementation was removed from the active branch because it duplicated the backend and assumed an app-first user journey.

## Domain boundaries

- Supply: `handymen`, `skills`, `handyman_skills`, `service_areas`
- Demand: `customers`, `jobs`
- Marketplace: `job_matches`, `job_assignments`, `reviews`
- Monetisation: `plans`, `subscriptions`, `entitlements`, `payments`, `payment_events`
- Conversation: `conversation_sessions`, `conversation_messages`

## Money model

`payments` records our interpretation of a payment. `payment_events` stores provider events with provider-level idempotency. `subscriptions` records recurring commercial state. `entitlements` is the only layer that grants product access.

This means refunds, trials, promotions, failed renewals and multiple PSPs can be supported without coupling feature access to one provider.

## Free and Pro access

Free membership grants 3 job opportunities per calendar month. We do not mutate a monthly counter. Instead, `job_matches.offered_at` is the usage ledger and candidate eligibility counts offers in the current month. Pro access is represented by an active `pro_access` entitlement.

## Matching

`find_job_candidates(job_id, limit)` currently requires exact skill and city, prefers exact suburb, then orders Pro before Free. It filters out Free handymen who already received 3 opportunities in the current month.

This is deliberately simple. Distance, response rate, rating and availability can be added only when real usage proves they improve outcomes.

## Assignment

`accept_job_transaction(match_id, handyman_phone)` locks the offer, job and
provider in one database transaction. The first valid acceptance creates the
unique assignment, marks competing offers lost and marks the job assigned.

For immediate jobs, `handymen.active_job_id` is the provider's capacity lease.
A partial unique index permits only one active immediate assignment per provider.
Assignment triggers set the provider to busy and release capacity only when the
job is completed or cancelled. The availability RPC and a database trigger both
reject attempts to override busy.

Scheduled jobs are recorded as scheduled assignments without consuming immediate
capacity. Provider cancellations record a reason and cool-down. Customer
completion, cancellation and administrative force-release all converge on the
same database release triggers.

## Security

All application tables have RLS enabled and are closed to public clients by
default. Privileged RPC functions are revoked from `PUBLIC`, `anon` and
`authenticated`, and granted only to `service_role`. Operational views use
`security_invoker` and are service-only.

The external WhatsApp webhook does not use Supabase user authentication; it
validates Meta's `X-Hub-Signature-256` over the raw request body. Internal Edge
Functions currently authenticate service-to-service calls with the configured
Supabase secret key.
