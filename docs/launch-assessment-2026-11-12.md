# HandyConnect launch assessment — 12 November 2026

## Decision
Continue the **existing Supabase/WhatsApp-first marketplace**. Do not re-introduce the retired NestJS/Prisma/Railway API, build a second booking engine, change production records, or launch automated outbound messages.

## Verified inventory
- GitHub: `robertmatiwa1/HandyConnect`, default `main`. Draft website PR #86 uses `feature/website-redesign-2026`.
- Supabase: `tjhuwtclvlxouwvktzem`, ACTIVE_HEALTHY, PostgreSQL 17, `eu-west-2`. Production database inspected read-only.
- Rows as sampled 2026-11-12 (not evidence of real business success): 7 handymen (5 active, 2 suspended; 1 verified), 3 customers, 0 jobs, 0 job matches, 0 assignments, 304 conversation messages, 402 WhatsApp inbound events, 90 notifications (77 sent, 13 dead_letter), 1 succeeded payment, 1 expired subscription, 6 stalled journeys.
- Numerous Edge Functions are ACTIVE, including `whatsapp-webhook`, `conversation-engine`, `job-intake-router`, `handyman-router`, `marketplace-dispatcher`, `notification-dispatcher`, `paystack-webhook`, and `admin-dashboard`. ACTIVE signifies deployed, not passing end-to-end tests.
- Railway `serene-tranquility` and `perceptive-love` each have a `handyconnect-api` with latest deployment FAILED; both have staged deletion changes. `perceptive-love` also has staged deletion of a Postgres service and volume. **Do not apply these staged changes without confirming retention/backups.**
- `site/` currently contains a Paystack-review product demo with legal pages, deployed via `.github/workflows/pages.yml` on `main`; website PR #86 adds `website/index.html` and must not overwrite those resources prematurely.
- Repository documentation of an August 2026 WhatsApp temporary bridge lists a Stokvel-bot-ledger WABA and number. **Do not assume that is the current official public booking number.**

## Current blocking risks
1. Official WhatsApp line and routing have not been live verified. Website CTA stays disabled until number, inbound message flow and brand identity are confirmed. No placeholder emails.
2. Zero active/historical rows in the main `jobs` table: exercise controlled customer > confirmed job > match > offer > accept > completion > notification lifecycle, and inspect audit/outbox at each step.
3. 13 `dead_letter` notifications require diagnosis before relying on unattended delivery.
4. Only one provider currently verified; validate the exact unverified-provider disclosure rule and supply coverage before acquiring demand.
5. Subscription exists but is expired despite a succeeded payment record; reconcile payment event timeline and entitlement before announcing Pro as live billing.
6. Compare deployed Edge Function versions against GitHub source and compare Supabase migration history to repository files; differences exist in migration names/versions. Never apply migrations mechanically.
7. Test privacy/security boundaries: signed Meta/Paystack webhook, service role isolation, idempotency, admin RBAC and recovery.

## Website implementation
This branch enhances the already-open PR #86 with responsive homeowner and commercial sections, service-discovery copy, a simple WhatsApp-first funnel, accessible navigation, and existing legal policy destinations.
The link is a deliberate launch gate: in `website/index.html`, set `verifiedWhatsappNumber` to the *currently verified* E.164 digits-only business number after a manual real-world click-to-chat test using separate customer and handyman accounts.
The two journeys use distinct prefilled messages but the same WhatsApp system of record. No database credentials or separate booking state are introduced.
Before promoting `website/index.html` to `site/index.html`: preserve the current reviewer demo at `site/product-review/index.html`, check relative legal links, run preview and accessibility checks, and verify official business claims.

## Minimal launch verification sequence
- Meta: challenge, signed incoming text and interactive reply; duplicate webhook must be idempotent.
- Customer: non-customer WhatsApp entry, job classification, province > town > area, photo, timing, consent, confirmation, status updates.
- Handyman: independent number, onboarding, verification/disclosure, skills/coverage, availability, offer reception, acceptance (first-accept-wins with concurrent competitor), start/completion.
- Marketplace: offer expiry, autonomous dispatcher schedule, refusal, redispatch, cancellations, retry/outbox delivery and dead-letter investigation.
- Billing: Paystack sandbox checkout, signed webhook, subscription renewal/expiry, only provider-confirmed success grants entitlement, refund/failure handling.
- Ops: metrics, incident alerting, bounded retries, restore and rollback plan, consent audit, recovery checks. Document evidence by trace IDs, not phone numbers.

## Splee evaluation (separate service)
Source: `Iweisc/splee` (AGPL-3.0), Rust backend, Node/pnpm frontend, PostgreSQL, Claude Code agent, email/IMAP; Docker compose provides **database only**, not a complete production deployment.
It can research commercial accounts and create **draft** outreach, but its automated cold-email, social and WhatsApp/SMS sending must **not** be enabled for prospects without lawful permission. Initial design: separate infrastructure, separate database, invite-only access, `SENDING_ENABLED=false`, no mailbox or Twilio sending credentials, human review of company-level results and consent provenance; no shared Supabase service-role key.
South African POPIA section 69 controls electronic direct marketing; a public business contact is not by itself unrestricted marketing permission. Record lawful basis and consent/source per person, one-time compliant consent request where appropriate, suppression, opt-out, retention and deletion. Legal review before any live campaign.
Splee integration, if validated, ends at approved prospect and enquiry handoff. Marketplace jobs originate only in the current WhatsApp booking engine.

## Release gates
1. Website preview + official line confirmed.
2. First end-to-end test job with evidence and no dead-letter delivery.
3. Provider supply and trust safety checks.
4. Subscription event reconciliation.
5. Ops monitoring and rollback verified.
6. Only then promote website, launch a limited geography and measure real demand, accepted jobs and paid subscriptions.